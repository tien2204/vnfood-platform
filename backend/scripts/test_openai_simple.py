#!/usr/bin/env python
"""Quick test script to verify OpenAI API key using direct HTTP requests.

Loads OPENAI_API_KEY from backend/.env (or environment) — never hardcode.
"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    sys.exit("OPENAI_API_KEY not set in environment or backend/.env")

BASE_URL = "https://api.openai.com/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

print("=" * 60)
print("Testing OpenAI API Key (Direct HTTP)")
print("=" * 60)

try:
    # Test 1: List models
    print("\n[1] Listing available models...")
    response = requests.get(f"{BASE_URL}/models", headers=headers, timeout=10)
    
    if response.status_code == 200:
        models = response.json()
        model_ids = [m['id'] for m in models.get('data', [])][:5]
        print(f"  ✅ Successfully fetched {len(models.get('data', []))} models")
        print(f"  Sample models: {', '.join(model_ids)}")
    else:
        print(f"  ❌ Error: {response.status_code} - {response.text}")
        exit(1)
    
    # Test 2: Chat completion with gpt-4o-mini
    print("\n[2] Testing chat completion (gpt-4o-mini)...")
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "user", "content": "Say 'API key works!' in one sentence."}
        ],
        "max_tokens": 50
    }
    
    response = requests.post(
        f"{BASE_URL}/chat/completions",
        headers=headers,
        json=payload,
        timeout=30
    )
    
    if response.status_code == 200:
        result = response.json()
        message = result['choices'][0]['message']['content']
        print(f"  ✅ Chat completion successful!")
        print(f"  Response: {message}")
        print(f"  Usage: {result['usage']['prompt_tokens']} tokens input, {result['usage']['completion_tokens']} tokens output")
    else:
        print(f"  ❌ Error: {response.status_code}")
        print(f"  Details: {response.text}")
        exit(1)
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED - Your API key is working!")
    print("=" * 60)
    print(f"\nModel tested: gpt-4o-mini")
    print(f"Available models: {len(models.get('data', []))}")
    
except requests.exceptions.ConnectionError as e:
    print(f"\n❌ Connection error: {e}")
    print("  Check your internet connection")
    exit(1)
    
except requests.exceptions.Timeout:
    print(f"\n❌ Request timeout")
    print("  The API took too long to respond")
    exit(1)
    
except Exception as e:
    print(f"\n❌ Error: {str(e)}")
    exit(1)
