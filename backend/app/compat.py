"""
Monkey-patch applied at startup — must be imported first in main.py.
RAGAS 0.4.x imports ChatVertexAI from langchain_community.chat_models.vertexai,
which was removed in langchain-community 0.4. Route it to langchain-google-vertexai.
"""
import sys
import types

_shim = types.ModuleType("langchain_community.chat_models.vertexai")
try:
    from langchain_google_vertexai import ChatVertexAI  # noqa: F401
    _shim.ChatVertexAI = ChatVertexAI
except ImportError:
    pass
sys.modules.setdefault("langchain_community.chat_models.vertexai", _shim)
