# Secrets and Environment

## Local secrets
Store provider credentials in `.env.local`.
Do not commit real keys into the repository.

## Supported variables

### OpenAI / ChatGPT image generation
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL`

### fal.ai animation generation
- `FAL_KEY`

## Notes
- `.env.local` is ignored by git.
- Prefer environment variables over hardcoded keys in scripts or source files.
- If a key is ever exposed in chat, rotate it after wiring it locally.
