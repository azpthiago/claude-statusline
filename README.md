# claude-statusline

Barra de status em duas linhas para o [Claude Code](https://claude.com/claude-code): limites de uso, conta logada, horário de reset e estado da sessão, alinhados em grade.

```
◆ Opus 5 (1M context)   │ effort medium                        │ ▸ claude-statusline ⑂ main  │ ctx ▰▱▱▱▱▱ 20%  198k/1M
◇ Thiago Paz · AZP Tech │ 7d ▰▱▱▱▱▱ 5%   ↻ 20/09 18:00 (5d04h) │ 5h ▰▰▱▱▱▱ 26%  ↻ 13:30 (25m) │ +128 -34 · ◷ 13:05
```

## Instalação

```bash
# Linux, macOS ou Git Bash
curl -fsSL https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.ps1 | iex
```

```bash
# a partir de um clone
git clone https://github.com/azpthiago/claude-statusline.git
cd claude-statusline && node scripts/setup.js
```

Requer Node.js 18+. Reinicie o Claude Code ao terminar. O instalador mostra ao final uma amostra da barra, com valores de exemplo — nunca com os dados da sua conta.

O instalador copia `statusline.js` para `~/.claude/` e registra a chave `statusLine` no `settings.json`, preservando o resto do arquivo e gravando um backup antes de escrever.

## O que mostra

| | Linha de cima | Linha de baixo |
|---|---|---|
| 1 | Modelo, com marca de contexto de 1M | Conta logada e organização |
| 2 | Effort, modo de permissão, output style e `fast` | Janela de 7 dias, com data do reset |
| 3 | Diretório e branch do git | Janela de 5 horas, com hora do reset e tempo restante |
| 4 | Contexto da sessão, em % e tokens | Linhas alteradas e relógio |

As barras vão de verde a vermelho conforme o consumo (40%, 70%, 90%). O horário de reset fica verde na última meia hora.

## De onde vêm os números

O Claude Code entrega à statusline, por stdin, os mesmos dados que alimentam `/usage` e `/context`:

```
rate_limits.five_hour.used_percentage    rate_limits.five_hour.resets_at
rate_limits.seven_day.used_percentage    rate_limits.seven_day.resets_at
context_window.used_percentage           context_window.context_window_size
```

A barra apenas formata esses campos — não lê transcripts, não soma tokens e não estima cota, então não diverge do `/usage`. Sem `rate_limits` no payload, os segmentos mostram `n/d` em vez de um número inventado.

## Opções

```bash
node scripts/setup.js --dry-run      # simula, sem escrever nada
node scripts/setup.js --padding 1    # recuo lateral (padrão 0)
node scripts/setup.js --no-color     # saída sem cores, para logs e CI
node scripts/setup.js --uninstall    # remove a barra e limpa o settings.json
node scripts/setup.js --claude-dir /outro/.claude
```

Equivalentes no PowerShell: `-Padding`, `-DryRun`, `-NoColor`, `-Uninstall`.

O `padding` alinha a barra com o restante do TUI: `0` acompanha a linha do `auto mode`, `1` deixa a barra recuada.

## Notas

Sem dependências — apenas APIs nativas do Node. Testado no Windows 11 (Git Bash e PowerShell 7); funciona igualmente em Linux e macOS.

Todos os glifos têm largura simples. Emoji foi evitado de propósito: sua largura varia entre terminais e desalinha as colunas.

## Licença

MIT — veja [LICENSE](LICENSE).
