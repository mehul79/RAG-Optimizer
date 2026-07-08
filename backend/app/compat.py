"""
Monkey-patch applied at startup — must be imported first in main.py.
RAGAS 0.4.x imports ChatVertexAI from langchain_community.chat_models.vertexai,
which was removed in langchain-community 0.4. Route it to langchain-google-vertexai.
"""
import sys
import types


def __getattr__(name: str):
    # ponytail: defers the actual langchain_google_vertexai import (pulls in
    # google-cloud-aiplatform) until RAGAS first touches ChatVertexAI, instead
    # of paying that cost on every server startup.
    if name == "ChatVertexAI":
        from langchain_google_vertexai import ChatVertexAI

        return ChatVertexAI
    raise AttributeError(name)


_shim = types.ModuleType("langchain_community.chat_models.vertexai")
_shim.__getattr__ = __getattr__
sys.modules.setdefault("langchain_community.chat_models.vertexai", _shim)
