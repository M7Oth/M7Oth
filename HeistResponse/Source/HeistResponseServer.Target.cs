using UnrealBuildTool;

// Dedicated server target. Requires a source build of Unreal Engine (launcher builds cannot build servers).
public class HeistResponseServerTarget : TargetRules
{
	public HeistResponseServerTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Server;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("HeistResponse");
	}
}
