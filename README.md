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
Then add the status line and hooks to `~/.claude/settings.json` (not in this repo). Safe to run again:
```zsh
bash ~/.claude/hooks/install.sh
```

### Herdr: this Mac's settings (`mh-state.json`)
Settings that differ per Mac, or that must not be public, are in `~/.config/herdr-app/mh-state.json`. Git ignores it, so make it on each Mac. Without the file, nothing is read or kept. Each key is optional. A missing `mh-ssh`, `mh-jira` or `mh-lunch` turns that feature off.
```zsh
[ -e ~/.config/herdr-app/mh-state.json ] || echo '{}' > ~/.config/herdr-app/mh-state.json
```
You can edit the file while Herdr runs. Herdr reads it again within 2 seconds, and writes it back when its own keys change. Then it keeps only the keys below (`FILES` in `mods/mh-footer/settings.js`), so a key it does not know is lost.

| Key | Mac | What it does |
|---|---|---|
| `space.colors`, `space-folders.folded` | both | Written by Herdr: space colors and folded sidebar folders. Do not edit. |
| `mh-board` | both | Board repos (`ctrl-a T`). `repos`: more `owner/repo` to show. `skip`: found repos to leave out. `hide`: parts of `owner/repo` names never shown. |
| `mh-ssh` | work | SSH passwords from 1Password (`ctrl-a s`). See below. Without it, ssh uses only keys (the 1Password ssh agent). |
| `mh-jira` | work | The Jira tab on the board. Without it, there is no Jira tab. |
| `mh-lunch` | work | The canteen for the lunch popup (`ctrl-a l`). Without it, `ctrl-a l` does nothing and the key list leaves it out. |

Work Mac example (all values are placeholders):
```json
{
  "mh-board": { "repos": ["owner/repo"], "skip": [], "hide": ["owner/other-team-"] },
  "mh-ssh": {
    "hostname": "10.0.0.",
    "op": { "-ruter": "op://Vault/Router/password", "*": "op://Vault/Kiosk/password" },
    "folder": "~/dev/work"
  },
  "mh-jira": { "account": "my.1password.eu", "vault": "Vault", "item": "Jira", "folded": ["Done"] },
  "mh-lunch": { "canteen": "1234567", "building": "1234568" }
}
```

- `mh-ssh.hostname`: only hosts with this HostName get a password. With a dot at the end it is a network prefix (`10.0.0.`). Without one, it must be the exact HostName. Without `hostname`, no host gets a password.
- `mh-ssh.op`: one `op://` reference, or a map from the end of a Host alias (`-ruter`) to a reference, with `*` for the others.
- `mh-ssh.folder`: where Claude starts beside an ssh session. Default `~`.
- `mh-jira`: the 1Password account, vault and item. The item has the fields `email`, `site` (`name.atlassian.net`), `board` (a number) and `credential` (an Atlassian API token). `folded`: column names to show folded at first. Backlog is always folded at first.
- `mh-lunch`: izy's canteen and building IDs, as strings of digits.

The private Mac needs only `{}`, or `mh-board` if you want the board to show more repos. More detail for agents: `herdr/.config/herdr-app/AGENTS.local.md`.

### Directory Structure
Initialize Git repositories for conditional includes to work:
```zsh
mkdir -p ~/dev/entur
cd ~/dev && git init
cd ~/dev/entur && git init
```

This enables automatic Git identity and SSH key