import os

# Tests never call a real model, even when a provider is exported in the shell.
os.environ["MOMO_LLM_PROVIDER"] = "fake"
