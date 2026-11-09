#include "HeistResponse.h"
#include "Modules/ModuleManager.h"
#include "Core/HRLocalization.h"

DEFINE_LOG_CATEGORY(LogHeist);

class FHeistResponseModule : public FDefaultGameModuleImpl
{
public:
	virtual void StartupModule() override
	{
		FHRLocalization::Get().Load();
	}
};

IMPLEMENT_PRIMARY_GAME_MODULE(FHeistResponseModule, HeistResponse, "HeistResponse");
