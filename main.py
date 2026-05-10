import os
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from tools import save_note

load_dotenv()

app = FastAPI()

tools = [
    save_note
]

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/chat")
def chat(request: ChatRequest):
    response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=request.message,
    config={
        "tools": tools
    }
)

    return {
        "reply": response.text
    }