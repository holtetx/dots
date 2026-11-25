# dots
Yet another attempt on making sensible dotfiles

## Installation

First install Homebrew:
```zsh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install packages:
```zsh
brew bundle install
```

Finally, symlink dotfiles:
```zsh
stow <folder> --target ~
```

## Manual Setup Steps

### SSH Keys
Copy public keys from 1Password to local `.ssh` folder:
- `~/.ssh/personal_git.pub` - Personal GitHub key
- `~/.ssh/entur_git.pub` - Work GitHub key

### Herdr
Install Herdr from herdr.dev (not in the Brewfile). Stow it before the first launch, or quit Herdr and move `~/.config/herdr-app` away first. The whole folder is linked because Herdr writes its own state next to the config. The `.gitignore` in `herdr/.config/herdr-app` lists the tracked files.
```zsh
stow herdr --target ~
```

The Herdr mods read labels that Claude Code sets. Stow `claude` for the hooks, the `herdr-link` skill and the scroll keys. It needs `jq`. The commands below do nothing when the scripts are missing or when Claude Code runs outside Herdr.
```zsh
stow claude --target ~
```
Then add to `~/.claude/settings.json` (not in this repo):
- `statusLine`, type `command`: `f="$HOME/.claude/hooks/statusline.sh"; [ -f "$f" ] && bash "$f"; true`
- A `SessionEnd` hook with command `f="$HOME/.claude/hooks/herdr-activity.sh"; [ -f "$f" ] && bash "$f"; true`.

### Directory Structure
Initialize Git repositories for conditional includes to work:
```zsh
mkdir -p ~/dev/entur
cd ~/dev && git init
cd ~/dev/entur && git init
```

This enables automatic Git identity and SSH key