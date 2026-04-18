# dmchess

A Telegram bot for playing chess with a friend in a group chat.

## Setup

1. Install system libraries for `cairosvg`:
   - macOS: `brew install cairo pango libffi`
   - Debian/Ubuntu: `sudo apt install libcairo2 libpango-1.0-0 libffi-dev`

2. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.

3. Install the package:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e ".[dev]"
   ```

4. Configure the token:

   ```bash
   cp .env.example .env
   # edit .env and paste the token from BotFather
   ```

5. Allow the bot to read group messages: message @BotFather, run `/setprivacy` for your bot, choose **Disable**. Without this, the bot only sees commands addressed to it explicitly and `/move` in a group will be ignored.

## Run

```bash
python -m dmchess.main
```

## Play

1. Add the bot to a Telegram group with one friend.
2. `/start` to begin a new game.
3. `/move e2 e4` to play a move. UCI squares only — no piece letters.
4. After each move, the bot re-posts the board from the next player's perspective.

## Test

```bash
pytest
```
