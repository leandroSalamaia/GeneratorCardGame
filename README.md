# Gerador de Cartas LotR LCG

Aplicativo local para importar dados do Hall of Beorn, traduzir por API e montar cartas usando os templates extraídos dos PSDs de `layout/`.

## Executar no Windows

```powershell
npm.cmd install
npm.cmd run dev
```

Abra o endereço exibido no terminal. Para conferir a versão compilada:

```powershell
npm.cmd run build
npm.cmd run preview
```

As APIs locais funcionam em `dev` e `preview`. Hospedar somente os arquivos de `dist` em um servidor estático não fornece essas APIs.

A pasta padrão de imagens é `D:\LOTR EXPANSIONS\Enhanced Proxies`. Para trocar a pasta:

```powershell
$env:LOTR_PROXIES_DIR = 'D:\Minha pasta de proxies'
npm.cmd run dev
```

## Importação e tradução

1. Importe pelo nome, URL de uma carta ou URL de um produto do Hall of Beorn.
2. Confira as cartas e selecione as desejadas.
3. Configure sua chave em **Tradução IA**. O modo automático do Gemini consulta os modelos disponíveis na conta; não pressupõe gratuidade.
4. Traduza, confira os textos no editor e exporte.

Reimporte as cartas que já estavam salvas com dados incorretos: as correções do importador não reescrevem automaticamente a biblioteca existente.

Os dois lados de uma missão mantêm texto, imagem e tradução próprios. O ZIP exporta os dois lados quando esses dados existem; cartas antigas sem dados completos não recebem um verso inventado. O PDF imprime o lado selecionado no baralho e gira missões dentro do espaço de uma carta para evitar sobreposição.

## O que foi corrigido

- Leitura dos atributos reais, traços completos, listas, símbolos e efeitos de sombra.
- Números sem denominadores inventados e identificação estável por carta/lado.
- Distinção entre expansão, cenário e conjunto de encontro.
- Busca de imagem por nome completo, expansão, número, etapa e lado; preferência por errata e rejeição de resultados ambíguos.
- Separação entre proxy completo e ilustração; alinhamento automático à moldura e rotação das missões, sem ampliar um pequeno recorte central.
- Ajuste de títulos e blocos de regras ao espaço disponível; regras, sombra e citação não se sobrepõem.
- Renderização sequencial com cópia dos dados para evitar misturar cartas durante operações assíncronas.
- Tipos em português, inclusive quando a palavra inglesa está incorporada ao PNG do template.
- Tradução vinculada ao identificador, preservando atributos e símbolos. Respostas incompletas são rejeitadas. Hífens e parênteses legítimos não são removidos dos nomes.
- Baralho separa lados e edições e não compartilha objetos mutáveis com a biblioteca.
- Imagens enviadas pelo usuário não são mais apagadas deliberadamente ao salvar. Se o armazenamento do navegador encher, aparece um aviso para exportar a biblioteca.
- Importações de produtos não param silenciosamente em 60 cartas; erros parciais são informados.

## Layout salvo por tipo de carta

O painel **Layout de Herói** (ou o tipo selecionado) fica acima das abas de edição:

- **Salvar/Atualizar layout** guarda posição X/Y, escala horizontal/vertical, zoom, rotação, trava de proporção e todos os ajustes de posição dos atributos.
- **Aplicar salvo** aplica essas posições à carta aberta. Para missões, aplica também aos dois lados.
- **Excluir salvo** remove o padrão daquele tipo, mantendo as posições da carta atual.

Cada tipo tem um layout próprio, persistido neste navegador. O padrão é aplicado automaticamente às próximas importações, ao carregar um modelo inicial e ao trocar para um tipo que tenha layout salvo. Cartas já salvas na biblioteca mantêm seus ajustes individuais; use **Aplicar salvo** para atualizá-las.

O layout guarda apenas posições e enquadramento, sem copiar imagem, texto, valores dos atributos, efeitos de cor ou marcas da borracha. Os layouts acompanham a exportação/importação JSON da biblioteca. Arquivos antigos sem layouts continuam compatíveis.

## Fontes e limites conhecidos

Os PSDs usam **Vafthrudnir** nos títulos. O arquivo da fonte não acompanha este projeto e não estava instalado no ambiente de validação. O renderizador procura a fonte instalada localmente; na ausência dela usa Cinzel. Os textos de regras usam Times New Roman. Para a aparência original dos títulos, instale uma cópia da Vafthrudnir que você tenha autorização para usar e reinicie o navegador.

O navegador usa os PNGs previamente extraídos, não interpreta PSDs a cada renderização. Alterar um PSD exige atualizar os templates. As ferramentas de extração antigas continuam em `scripts/`; não foram executadas sobre seus PSDs durante esta correção.

Em **Arte & Ilustração**, proxies completos têm a opção **Alinhar à moldura automaticamente** e o botão **Restaurar composição original**, que redefine posição, escala e rotação sem alterar cores ou posições dos atributos. A opção de alinhamento acompanha o layout salvo por tipo. Para cartas com ajustes antigos, restaure o enquadramento e salve novamente o layout, se desejar usá-lo nas próximas importações.

O alinhamento compara detalhes da moldura com a imagem original e compensa diferenças de margens e proporções da digitalização. Edições com molduras diferentes ainda podem mostrar pequenos contornos duplicados e precisar de ajustes manuais de posição/escala ou de uma ilustração sem moldura. A substituição dos tipos incorporados ao PNG pode deixar uma diferença de textura na faixa. Missões paralelas exigem um template próprio e são rejeitadas explicitamente.

Nenhuma chamada de tradução paga foi feita na validação. A associação de cartas, preservação de símbolos e tradução de ambos os lados foram testadas com respostas simuladas; a qualidade linguística depende do modelo e deve ser revisada.

## Validação

```powershell
npm.cmd test
npm.cmd run build
node scripts/validate-render.mjs
```

Os testes usam páginas reais arquivadas em `tests/fixtures`, sem precisar de rede. A geração de amostras usa as imagens da pasta de proxies. As amostras ficam em `scratch/validation/`.

A verificação adicional no Edge usa Playwright instalado separadamente:

```powershell
npm.cmd install --prefix scratch/browser-check --no-save --package-lock=false playwright
npm.cmd run dev -- --host 127.0.0.1 --port 5178
# Em outro terminal:
node scripts/validate-browser.mjs
```

Ela valida a importação real, canvas de missão, ZIP com dois PNGs e PDF com duas páginas, e salva os resultados em `scratch/validation/`.

Os arquivos anteriores às alterações estão em `scratch/backup-before-fixes-*`. Os PSDs e a pasta original de proxies não foram modificados.


## Arte estendida por IA na importação

A busca rápida e o importador têm **Estender arte com IA local (experimental)**, ativada inicialmente. A preferência é compartilhada entre os dois controles e salva neste navegador. Desmarque para importar sem gerar arte.

Após buscar as cartas, o aplicativo processa as imagens locais em sequência com SDXL Inpainting, preserva o interior do recorte original e ajusta as cores das junções. Missões processam cada lado separadamente. A interface mostra a carta em processamento; imagens já geradas são reutilizadas pelo cache. Uma falha mantém a imagem original e exibe um aviso.

O ambiente instalado está em D:/GeradorCartas-AI/venv, os modelos em D:/GeradorCartas-AI/huggingface e o cache permanente em D:/GeradorCartas-AI/import-cache. Os caminhos do Python e cache podem ser configurados por LOTR_AI_PYTHON e LOTR_AI_CACHE. Cada geração guarda report.json e worker.log. O proxy original continua referenciado em originalProxyArt; seu arquivo não é alterado.

Os dez tipos têm perfis iniciais de recorte. São aproximações: imagens de outras edições podem precisar de ajustes e a extensão inventa conteúdo. Esta versão usa imagens da pasta local de proxies; imagens disponíveis somente pela internet permanecem originais, com aviso. O JSON da biblioteca referencia o cache local: copie também essa pasta ao migrar de computador. O tempo medido no Aragorn foi de cerca de 18 segundos de geração, além da carga do Python/modelo; varia por imagem e uso da GPU.

Validação adicional do fluxo real: node scripts/validate-ai-import-browser.mjs (servidor na porta 5178 e ambiente local instalados).
