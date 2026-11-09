using UnrealBuildTool;

public class HeistResponse : ModuleRules
{
	public HeistResponse(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;

		PublicIncludePaths.Add(ModuleDirectory);

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput",
			"NetCore", "PhysicsCore", "ChaosVehicles",
			"AIModule", "NavigationSystem", "GameplayTasks",
			"UMG", "Slate", "SlateCore", "AnimGraphRuntime", "Niagara",
			"OnlineSubsystem", "OnlineSubsystemUtils",
			"DeveloperSettings"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { "ApplicationCore" });
	}
}
