# claude-statusline

Barra de status em duas linhas para o [Claude Code](https://claude.com/claude-code), com uso agregado, conta logada, horário de reset da janela de 5 horas e estado da sessão — tudo alinhado em grade.

```
◆ Opus 5 (1M context)       │ effort medium · auto-edit │ ▸ gt-telemetry ⑂ development  │ ctx ▰▱▱▱▱▱ 145k/1M
◇ Thiago Paz · Team Avillis │ 7d ▰▱▱▱▱▱ 2%              │ 5h ▰▱▱▱▱▱ 10%  ↻ 17:00 (4h06) │ +91 -89 · ◷ 12:53
```

## O que mostra

| Coluna | Linha de cima | Linha de baixo |
|---|---|---|
| 1 | Modelo em uso, com marca de contexto de 1M | Conta logada e organização |
| 2 | Effort, modo de permissão e output style | Consumo dos últimos 7 dias |
| 3 | Diretório e branch do git | Consumo do bloco de 5h, horário de reset e tempo restante |
| 4 | Ocupação do contexto da sessão | Linhas adicionadas/removidas e relógio |

O modo de permissão muda de cor conforme o risco: verde em `normal`, amarelo em `auto-edit`, azul em `plan` e vermelho em `bypass`.

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

Reinicie o Claude Code depois de instalar. Requer **Node.js 18+**, que o instalador verifica antes de mexer em qualquer coisa.

O instalador copia `statusline.js` para `~/.claude/`, cria a configuração inicial e registra a chave `statusLine` no seu `settings.json` — preservando todo o resto do arquivo e gravando um backup com carimbo de data antes de qualquer alteração.

### Opções

```bash
node scripts/setup.js --dry-run      # mostra o que faria, sem escrever nada
node scripts/setup.js --padding 1    # recuo lateral da barra (padrão 0)
node scripts/setup.js --uninstall    # remove a barra e limpa o settings.json
node scripts/setup.js --claude-dir /caminho/alternativo/.claude
```

No PowerShell: `.\install.ps1 -Padding 1`, `.\install.ps1 -Uninstall`, `.\install.ps1 -DryRun`.

## Configuração

As porcentagens de uso são calculadas sobre os tetos em `~/.claude/statusline.config.json`:

```json
{
  "weeklyLimitTokens": 200000000,
  "blockLimitTokens": 40000000
}
```

Esses valores são um ponto de partida, **não a sua cota real** — nenhuma API local expõe a cota da assinatura. Acompanhe seus próprios picos e ajuste. Definindo qualquer um como `null`, aquele segmento passa a mostrar o total de tokens em vez de porcentagem.

Suas edições nesse arquivo sobrevivem a reinstalações: o instalador só o cria quando ele ainda não existe.

## Como o uso é calculado

O script lê os transcripts de sessão em `~/.claude/projects/**/*.jsonl` e soma os tokens de cada resposta (entrada, saída, escrita e leitura de cache), deduplicando por `messageId` + `requestId` — necessário porque sessões retomadas repetem registros entre arquivos.

Para não pagar esse custo a cada refresh, um cache incremental em `~/.claude/statusline-cache.json` guarda agregados por hora e a posição já lida de cada arquivo, relendo apenas os bytes novos. O histórico é podado em 10 dias. Na prática, cada atualização da barra leva cerca de 100 ms.

O **bloco de 5 horas** é inferido dos logs locais: começa na primeira atividade após um intervalo de 5h ou mais, e o reset é esse início somado a 5 horas. É a mesma heurística do `ccusage`. Como a cota real vive no servidor, o horário pode divergir se você usa o Claude em mais de uma máquina.

## Compatibilidade

Testado no Windows 11 com Git Bash e PowerShell 7. O script em si só usa APIs nativas do Node e `os.homedir()`, sem dependências, então funciona igualmente em Linux e macOS.

Todos os glifos são caracteres de largura simples — nada de emoji, cuja largura varia entre terminais e desalinha as colunas.

## Desinstalação

```bash
node scripts/setup.js --uninstall
```

Remove o script, o cache e a chave `statusLine` do `settings.json`, mantendo sua configuração caso queira reinstalar depois.

## Licença

MIT — veja [LICENSE](LICENSE).
