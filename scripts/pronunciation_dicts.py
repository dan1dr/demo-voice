import os
from dotenv import load_dotenv
from elevenlabs import PronunciationDictionaryVersionLocator, play
from elevenlabs.client import ElevenLabs

load_dotenv()
API_KEY = os.getenv("ELEVENLABS_API_KEY")
if not API_KEY:
    raise ValueError("Missing ELEVENLABS_API_KEY")

MODEL_ID = "eleven_turbo_v2"
VOICE_ID = "sDuUJMeNJR828mXTRrDh"
PLS_PATH = "utils/dictionary.pls"


def main():
    client = ElevenLabs(api_key=API_KEY)

    # 1) Create dictionary from PLS (read as TEXT, like your working example)
    with open(PLS_PATH, "r", encoding="utf-8") as f:
        pdict = client.pronunciation_dictionaries.create_from_file(
            file=f.read(),
            name="example",
        )

    # 2) Synthesize without vs with dictionary
    audio_1 = client.text_to_speech.convert(
        text="Without the dictionary: tomato",
        voice_id=VOICE_ID,
        model_id=MODEL_ID,
    )

    audio_2 = client.text_to_speech.convert(
        text="With the dictionary: tomato",
        voice_id=VOICE_ID,
        model_id=MODEL_ID,
        pronunciation_dictionary_locators=[
            PronunciationDictionaryVersionLocator(
                pronunciation_dictionary_id=pdict.id,
                version_id=pdict.version_id,
            )
        ],
    )

    # 3) Remove rules -> NEW version
    removed = client.pronunciation_dictionaries.rules.remove(
        pronunciation_dictionary_id=pdict.id,
        rule_strings=["tomato", "Tomato"],
    )

    audio_3 = client.text_to_speech.convert(
        text="With the rule removed: tomato",
        voice_id=VOICE_ID,
        model_id=MODEL_ID,
        pronunciation_dictionary_locators=[
            PronunciationDictionaryVersionLocator(
                pronunciation_dictionary_id=removed.id,
                version_id=removed.version_id,
            )
        ],
    )

    # 4) Add a phoneme rule back -> NEW version
    dict_added = client.pronunciation_dictionaries.rules.add(
        pronunciation_dictionary_id=removed.id,
        rules=[
            {
                "type": "phoneme",
                "string_to_replace": "tomato",
                "phoneme": "t ə ˈ m eɪ t oʊ",  # IPA example
                "alphabet": "ipa",
                "match_method": "exact",
                "case_sensitive": False,
                "priority": 0,
            }
        ],
    )

    audio_4 = client.text_to_speech.convert(
        text="With the rule added again: tomato",
        voice_id=VOICE_ID,
        model_id=MODEL_ID,
        pronunciation_dictionary_locators=[
            PronunciationDictionaryVersionLocator(
                pronunciation_dictionary_id=dict_added.id,
                version_id=dict_added.version_id,
            )
        ],
    )

    # Play audios
    play.play(audio_1)
    play.play(audio_2)
    play.play(audio_3)
    play.play(audio_4)


if __name__ == "__main__":
    main()
