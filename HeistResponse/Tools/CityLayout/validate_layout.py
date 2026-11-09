#!/usr/bin/env python3
"""Validates the district layout for gameplay pacing and renders an SVG map.

Checks (all distances along the road graph, Manhattan within the grid):
  * Police response time (station -> bank) vs dispatch delay: police must arrive after robbers had
    a meaningful window but well before the response clock ends.
  * Every extraction zone has at least 2 edge-disjoint road routes from the bank (no single choke).
  * Escape drive times are within the response window and differ enough to make routes a choice.
  * No location rectangle overlaps a road or another location.
Usage: python3 validate_layout.py [--svg out.svg]
"""
import json, os, sys, heapq, itertools

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, "district.json")))
T = L["tuning"]
xs = [a["x"] for a in L["roads"]["avenues_x"]]
ys = [s["y"] for s in L["roads"]["streets_y"]]

# ---------------------------------------------------------------- road graph
nodes = {(x, y) for x in xs for y in ys}
edges = {}
def add_edge(a, b):
    d = abs(a[0] - b[0]) + abs(a[1] - b[1])
    edges.setdefault(a, {})[b] = d
    edges.setdefault(b, {})[a] = d
for x in xs:
    for y0, y1 in zip(ys, ys[1:]): add_edge((x, y0), (x, y1))
for y in ys:
    for x0, x1 in zip(xs, xs[1:]): add_edge((x0, y), (x1, y))
for al in L["roads"]["alleys"]:
    a, b = tuple(al["from"]), tuple(al["to"])
    # Split the street segments the alley endpoints lie on, then connect.
    for p in (a, b):
        if p in nodes: continue
        nodes.add(p)
        for u in list(edges):
            for v in list(edges.get(u, {})):
                on_h = u[1] == v[1] == p[1] and min(u[0], v[0]) < p[0] < max(u[0], v[0])
                on_v = u[0] == v[0] == p[0] and min(u[1], v[1]) < p[1] < max(u[1], v[1])
                if on_h or on_v:
                    del edges[u][v]; del edges[v][u]
                    add_edge(u, p); add_edge(p, v)
                    break
            else: continue
            break
    add_edge(a, b)
nodes |= set(edges)

def nearest_node(p):
    return min(nodes, key=lambda n: abs(n[0] - p[0]) + abs(n[1] - p[1]))

def dijkstra(src, banned=frozenset()):
    dist, pq, prev = {src: 0}, [(0, src)], {}
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, w in edges[u].items():
            if (u, v) in banned or (v, u) in banned: continue
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v], prev[v] = nd, u
                heapq.heappush(pq, (nd, v))
    return dist, prev

def path(prev, src, dst):
    p, n = [dst], dst
    while n != src:
        n = prev[n]; p.append(n)
    return p[::-1]

def loc(i):
    return next(l for l in L["locations"] if l["id"] == i)
def center(r): return ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)

errors, report = [], []
bank_entry = nearest_node((600, 610))
station_exit = nearest_node((1200, 120))
d, _ = dijkstra(station_exit)
police_drive = d[bank_entry] / T["car_speed_mps"]
police_total = T["dispatch_delay_s"] + police_drive
report.append(f"Police response: {d[bank_entry]:.0f} m drive = {police_drive:.0f}s + dispatch {T['dispatch_delay_s']}s = {police_total:.0f}s")
if police_total < 35: errors.append("Police arrive too fast (<35s) - robbers get no loud-phase window")
if police_total > 110: errors.append("Police arrive too slowly (>110s) - robbers can loot unopposed")

safe = nearest_node(center(loc("safehouse")["rect"]))
ds, _ = dijkstra(safe)
report.append(f"Robber approach (garage -> bank): {ds[bank_entry]:.0f} m = {ds[bank_entry]/T['car_speed_mps']:.0f}s by car")

times = []
for z in L["extraction_zones"]:
    zn = nearest_node(z["pos"])
    db, prev = dijkstra(bank_entry)
    p1 = path(prev, bank_entry, zn)
    banned = frozenset(zip(p1, p1[1:]))
    db2, prev2 = dijkstra(bank_entry, banned)
    alt = db2.get(zn)
    speed = T["car_speed_mps"] if z["vehicles"] else T["run_speed_mps"]
    t = db[zn] / speed
    times.append(t)
    report.append(f"Extraction '{z['id']}': {db[zn]:.0f} m ({t:.0f}s {'car' if z['vehicles'] else 'on foot'}), "
                  f"alternative disjoint route: {('%.0f m' % alt) if alt else 'NONE'}")
    if alt is None: errors.append(f"Extraction {z['id']} has a single choke route")
    if t > T["min_response_window_s"] * 0.6: errors.append(f"Extraction {z['id']} too far for the response window")
if times and max(times) - min(times) < 15:
    errors.append("Extraction times too similar - route choice is meaningless")

# Overlaps
road_rects = [(a["x"] - a["width"] / 2, -20, a["x"] + a["width"] / 2, 1060) for a in L["roads"]["avenues_x"]] + \
             [(-20, s["y"] - s["width"] / 2, 1240, s["y"] + s["width"] / 2) for s in L["roads"]["streets_y"]]
alley_rects = []
for al in L["roads"]["alleys"]:
    (x0, y0), (x1, y1) = al["from"], al["to"]; hw = al["width"] / 2
    alley_rects.append((min(x0, x1) - hw, min(y0, y1) - hw, max(x0, x1) + hw, max(y0, y1) + hw))
def overlap(a, b): return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]
for l in L["locations"]:
    for r in road_rects + alley_rects:
        if overlap(l["rect"], r): errors.append(f"{l['id']} overlaps a road/alley")
for a, b in itertools.combinations(L["locations"], 2):
    if overlap(a["rect"], b["rect"]) and "plaza" not in (a["type"], b["type"]):
        errors.append(f"{a['id']} overlaps {b['id']}")

w = L["bounds"]["x"][1] - L["bounds"]["x"][0]; h = L["bounds"]["y"][1] - L["bounds"]["y"][0]
report.append(f"Playable district: {w} x {h} m ({w*h/1e6:.2f} km^2), {len(nodes)} road nodes, {sum(len(v) for v in edges.values())//2} road segments")

print("\n".join(report))
for e in errors: print("ERROR:", e)

# ---------------------------------------------------------------- SVG
if "--svg" in sys.argv:
    out = sys.argv[sys.argv.index("--svg") + 1]
    bx, by = L["bounds"]["x"], L["bounds"]["y"]
    S = 0.7
    def X(v): return (v - bx[0]) * S
    def Y(v): return (by[1] - v) * S
    col = {"bank": "#e8b931", "police_station": "#2f7bff", "garage": "#ff7a1a", "plaza": "#3a4a3a", "parking_structure": "#6b7280",
           "office": "#3b4252", "residential": "#4b4f58", "retail": "#5b4b6b", "retail_row": "#6b4b5b", "warehouse": "#4a4136",
           "hotel": "#435266", "market": "#5a4a3a", "civic": "#3f5a4f", "service": "#555", "mixed": "#474d57"}
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w*S:.0f}" height="{h*S:.0f}" font-family="sans-serif">',
           f'<rect width="100%" height="100%" fill="#1b1f24"/>']
    for b in L["boundaries"]:
        r = b["rect"]; fill = {"highway_elevated": "#2a2f36", "harbor_water": "#123049", "construction_wall": "#4a3d20", "rail_cutting": "#2b2b2b"}[b["type"]]
        svg.append(f'<rect x="{X(r[0]):.1f}" y="{Y(r[3]):.1f}" width="{(r[2]-r[0])*S:.1f}" height="{(r[3]-r[1])*S:.1f}" fill="{fill}"/>')
    for r in road_rects:
        svg.append(f'<rect x="{X(r[0]):.1f}" y="{Y(r[3]):.1f}" width="{(r[2]-r[0])*S:.1f}" height="{(r[3]-r[1])*S:.1f}" fill="#3c4148"/>')
    for l in L["locations"]:
        r = l["rect"]
        svg.append(f'<rect x="{X(r[0]):.1f}" y="{Y(r[3]):.1f}" width="{(r[2]-r[0])*S:.1f}" height="{(r[3]-r[1])*S:.1f}" rx="3" fill="{col.get(l["type"], "#444")}" stroke="#0008"/>')
        cx, cy = center(r)
        svg.append(f'<text x="{X(cx):.1f}" y="{Y(cy):.1f}" fill="#e5e7eb" font-size="9" text-anchor="middle">{l["name"]}</text>')
    for al in L["roads"]["alleys"]:
        (x0, y0), (x1, y1) = al["from"], al["to"]
        svg.append(f'<line x1="{X(x0):.1f}" y1="{Y(y0):.1f}" x2="{X(x1):.1f}" y2="{Y(y1):.1f}" stroke="#565c64" stroke-width="{al["width"]*S:.1f}"/>')
    for z in L["extraction_zones"]:
        svg.append(f'<circle cx="{X(z["pos"][0]):.1f}" cy="{Y(z["pos"][1]):.1f}" r="9" fill="#34d399" stroke="#fff"/>'
                   f'<text x="{X(z["pos"][0]):.1f}" y="{Y(z["pos"][1])-12:.1f}" fill="#34d399" font-size="10" text-anchor="middle">{z["name"]}</text>')
    for team, c in (("police", "#2f7bff"), ("robbers", "#ff7a1a")):
        for p in L["spawns"][team]:
            svg.append(f'<circle cx="{X(p[0]):.1f}" cy="{Y(p[1]):.1f}" r="3" fill="{c}"/>')
    svg.append('</svg>')
    open(out, "w").write("\n".join(svg))
    print("map ->", out)

sys.exit(1 if errors else 0)
