#include "Core/HRLocalization.h"
#include "HeistResponse.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

FHRLocalization& FHRLocalization::Get()
{
	static FHRLocalization Instance;
	return Instance;
}

void FHRLocalization::ParseCsvLine(const FString& Line, TArray<FString>& OutFields)
{
	OutFields.Reset();
	FString Current;
	bool bInQuotes = false;
	for (int32 i = 0; i < Line.Len(); ++i)
	{
		const TCHAR C = Line[i];
		if (bInQuotes)
		{
			if (C == TEXT('"'))
			{
				if (i + 1 < Line.Len() && Line[i + 1] == TEXT('"')) { Current.AppendChar(TEXT('"')); ++i; }
				else { bInQuotes = false; }
			}
			else { Current.AppendChar(C); }
		}
		else if (C == TEXT('"')) { bInQuotes = true; }
		else if (C == TEXT(',')) { OutFields.Add(Current); Current.Reset(); }
		else { Current.AppendChar(C); }
	}
	OutFields.Add(Current);
}

void FHRLocalization::Load()
{
	Arabic.Reset();
	English.Reset();
	const FString Path = FPaths::ProjectContentDir() / TEXT("Localization/Raw/HRStrings.csv");
	TArray<FString> Lines;
	if (!FFileHelper::LoadFileToStringArray(Lines, *Path))
	{
		UE_LOG(LogHeist, Error, TEXT("HRLocalization: could not read %s"), *Path);
		return;
	}
	TArray<FString> Fields;
	for (int32 i = 1; i < Lines.Num(); ++i) // skip header
	{
		const FString Line = Lines[i].TrimEnd();
		if (Line.IsEmpty() || Line.StartsWith(TEXT("#"))) { continue; }
		ParseCsvLine(Line, Fields);
		if (Fields.Num() < 3) { continue; }
		const FName Key(*Fields[0]);
		Arabic.Add(Key, Fields[1].Replace(TEXT("\\n"), TEXT("\n")));
		English.Add(Key, Fields[2].Replace(TEXT("\\n"), TEXT("\n")));
	}
	bLoaded = true;
	UE_LOG(LogHeist, Log, TEXT("HRLocalization: loaded %d strings"), Arabic.Num());
}

void FHRLocalization::SetLanguage(const FString& InLanguage)
{
	Language = (InLanguage == TEXT("en")) ? TEXT("en") : TEXT("ar");
}

FText FHRLocalization::Text(const FName Key) const
{
	const TMap<FName, FString>& Primary = (Language == TEXT("en")) ? English : Arabic;
	if (const FString* S = Primary.Find(Key))
	{
		if (!S->IsEmpty()) { return FText::FromString(*S); }
	}
	if (const FString* S = English.Find(Key)) { return FText::FromString(*S); }
	return FText::FromName(Key);
}
