#pragma once

#include "CoreMinimal.h"

/**
 * Arabic-first runtime string table.
 * Strings live in Content/Localization/Raw/HRStrings.csv (columns: Key,ar,en) so translators can
 * edit them without touching code. Tools/validate_strings.py checks the file in CI.
 * Missing keys fall back to English, then to the key itself (so gaps are visible in QA).
 */
class HEISTRESPONSE_API FHRLocalization
{
public:
	static FHRLocalization& Get();

	void Load();
	void SetLanguage(const FString& InLanguage); // "ar" or "en"
	const FString& GetLanguage() const { return Language; }
	bool IsRightToLeft() const { return Language == TEXT("ar"); }

	FText Text(const FName Key) const;

private:
	FString Language = TEXT("ar");
	TMap<FName, FString> Arabic;
	TMap<FName, FString> English;
	bool bLoaded = false;

	static void ParseCsvLine(const FString& Line, TArray<FString>& OutFields);
};

/** Shorthand: HRText("HUD.Alarm") */
#define HRText(Key) FHRLocalization::Get().Text(FName(TEXT(Key)))
