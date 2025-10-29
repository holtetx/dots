export ZSH="$HOME/.oh-my-zsh"

# ZSH_THEME="robbyrussell"

plugins=(
  git
  brew
  mise
  zsh-autosuggestions
  zsh-syntax-highlighting
  zoxide
  docker
)

source $ZSH/oh-my-zsh.sh

alias reload="source $HOME/.zshrc"
alias cd="z"
alias cat="bat"
alias pn="pnpm"
alias vc="code"

alias lg="lazygit"
alias ld="lazydocker"

alias lf='eza -lfh'  # lists only files (no directories) with column headers
alias lh='eza -dl .* --group-directories-first'  # lists hidden files and directories
alias ls='eza -alh --group-directories-first'  # lists everything with directories first with column headers

# Tool completions and activations
eval "$(mise activate zsh)"
eval "$(mise completion zsh)"
source <(fzf --zsh)

# Only auto start Zellij if in Ghostty terminal
if [[ "$TERM_PROGRAM" == "ghostty" ]]; then
    eval "$(zellij setup --generate-auto-start zsh)"
fi

# Required Setup after pnpm is installed
# `pnpm completion zsh > ~/completion-for-pnpm.zsh`
source ~/completion-for-pnpm.zsh

# Prompt (should be last to ensure it can access all loaded functions)
eval "$(starship init zsh)"
