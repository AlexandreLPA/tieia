import io
import math
import struct
import wave


def tone_wav(seconds: float = 1.0, rate: int = 44100) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(
            b"".join(
                struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / rate)))
                for i in range(int(seconds * rate))
            )
        )
    return buffer.getvalue()


def test_converts_wav_to_mp3(client) -> None:
    resp = client.post(
        "/api/audio/convert",
        files={"file": ("narracao.wav", tone_wav(), "audio/wav")},
        data={"bitrate": "192"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    # An MP3 starts with an ID3 tag or a frame sync
    assert resp.content[:3] == b"ID3" or resp.content[0] == 0xFF


def test_refuses_odd_bitrates_and_formats(client) -> None:
    wav = tone_wav(0.1)
    assert client.post(
        "/api/audio/convert", files={"file": ("a.wav", wav, "audio/wav")}, data={"bitrate": "999"}
    ).status_code == 400
    assert client.post(
        "/api/audio/convert", files={"file": ("a.exe", wav, "application/octet-stream")}
    ).status_code == 400
