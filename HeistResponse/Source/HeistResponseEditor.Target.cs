using UnrealBuildTool;

public class HeistResponseEditorTarget : TargetRules
{
	public HeistResponseEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("HeistResponse");
	}
}
