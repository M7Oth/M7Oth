using UnrealBuildTool;

public class HeistResponseTarget : TargetRules
{
	public HeistResponseTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("HeistResponse");
	}
}
