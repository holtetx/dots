/opt/homebrew/bin/brew shellenv fish | source
fish_add_path -g ~/.local/bin
# mise activates itself through Homebrew's vendor_conf.d

if status is-interactive
    set -g fish_greeting

    alias cat bat
    alias ls "eza -alh --group-directories-first"

    abbr -a pn pnpm
    abbr -a lg lazygit
    abbr -a ld lazydocker

    # oh-my-zsh git aliases in daily use
    abbr -a gl git pull
    abbr -a gsw git switch
    abbr -a gswm git switch main
    abbr -a ggfl git push --force-with-lease origin HEAD
    abbr -a glol 'git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset"'

    # Warp lists fzf key bindings as incompatible
    test "$TERM_PROGRAM" != WarpTerminal; and fzf --fish | source

    zoxide init fish --cmd cd | source
    starship init fish | source
end
