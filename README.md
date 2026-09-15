# claude-statusline

Barra de status em duas linhas para o [Claude Code](https://claude.com/claude-code): limites de uso, conta logada, horário de reset e estado da sessão — tudo alinhado em grade.

```
◆ Opus 5 (1M context)       │ effort medium                        │ ▸ .claude                    │ ctx ▰▱▱▱▱▱ 20%  198k/1M
◇ Thiago Paz · Team Avillis │ 7d ▰▱▱▱▱▱ 5%   ↻ 20/09 18:00 (5d04h) │ 5h ▰▰▱▱▱▱ 26%  ↻ 13:30 (20m) │ +563 -387 · ◷ 13:10
```

## Os números são os oficiais

O Claude Code entrega à statusline, por stdin, os mesmos dados que alimentam `/usage` e `/context`:

```
rate_limits.five_hour.used_percentage    rate_limits.five_hour.resets_at
rate_limits.seven_day.used_percentage    rate_limits.seven_day.resets_at
context_window.used_percentage           context_window.context_window_size
```

A barra apenas formata esses campos. Não lê transcripts, não soma tokens, não estima cota nem mantém cache — logo não há como divergir do que o `/usage` mostra. Se a sua versão do Claude Code não enviar `rate_limits`, os segmentos aparecem como `n/d`, em vez de exibir um número inventado.

## O que mostra

| Coluna | Linha de cima | Linha de baixo |
|---|---|---|
| 1 | Modelo em uso, com marca de contexto de 1M | Conta logada e organização |
| 2 | Effort, modo de permissão, output style e `fast` quando ativo | Uso da janela de 7 dias, com data do reset |
| 3 | Diretório e branch do git | Uso da janela de 5 horas, com hora do reset e tempo restante |
| 4 | Contexto da sessão, em % e tokens | Linhas adicionadas/removidas e relógio |

As barras mudam de cor conforme o consumo: verde até 40%, amarelo até 70%, laranja até 90% e vermelho acima disso. O horário de reset fica verde quando falta menos de meia hora.

## Instalação

**Linux, macOS ou Git Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.ps1 | iex
```

**A partir de um clone:**

```bash
git clone https://github.com/azpthiago/claude-statusline.git
cd claude-statusline
node scripts/setup.js
```

Reinicie o Claude Code depois de instalar. Requer **Node.js 18+**, verificado antes de qualquer alteração.

O instalador copia `statusline.js` para `~/.claude/` e registra a chave `statusLine` no seu `settings.json`, preservando todo o resto do arquivo e gravando um backup com carimbo de data antes de escrever.

### Opções

```bash
node scripts/setup.js --dry-run      # mostra o que faria, sem escrever nada
node scripts/setup.js --padding 1    # recuo lateral da barra (padrão 0)
node scripts/setup.js --uninstall    # remove a barra e limpa o settings.json
node scripts/setup.js --claude-dir /caminho/alternativo/.claude
```

No PowerShell: `.\install.ps1 -Padding 1`, `.\install.ps1 -Uninstall`, `.\install.ps1 -DryRun`.

O `padding` alinha a barra com o restante do TUI. O padrão `0` acompanha a linha do `auto mode`; use `1` se preferir a barra recuada.

## Compatibilidade

Sem dependências — só APIs nativas do Node e `os.homedir()`. Testado no Windows 11 com Git Bash e PowerShell 7; funciona igualmente em Linux e macOS.

Todos os glifos têm largura simples. Emoji foi evitado de propósito: sua largura varia entre terminais e desalinha as colunas.

Cada refresh custa cerca de 95 ms, quase todo em partida do Node — a barra em si só formata o payload que já recebeu.

## Desinstalação

```bash
node scripts/setup.js --uninstall
```

Remove o script e a chave `statusLine` do `settings.json`, restaurando o comportamento padrão.

## Licença

MIT — veja [LICENSE](LICENSE).
