# Enviar Diagnose — RX7 iOS Sysdiagnose Scanner

O **Enviar Diagnose** é uma aplicação estática para triagem de arquivos SYSdiagnose de **iPhone/iOS**. A leitura, a extração e a detecção ocorrem no navegador: o arquivo selecionado segue da File API para um Web Worker local, onde é validado, percorrido e analisado. A análise básica não envia o SYSdiagnose a uma API ou servidor e não depende da infraestrutura Manus.

> O relatório é uma triagem técnica baseada em regras contextuais. Ele não substitui análise forense independente nem determina, sozinho, uma conclusão definitiva.

## Escopo e privacidade

O scanner aceita `.tar.gz`, `.tgz` e `.zip`, detectando o formato pelos bytes iniciais do arquivo. O conteúdo é tratado exclusivamente como dado não confiável; ele nunca é executado. O histórico em IndexedDB armazena somente relatórios e metadados locais — nunca os bytes do SYSdiagnose — e as personalizações de assinaturas também permanecem no navegador.

| Controle | Comportamento atual |
|---|---|
| Tamanho máximo do arquivo | 350 MB |
| Extração | TAR.GZ por chunks e ZIP com leitura de Blob no Web Worker |
| Proteções | Cabeçalho, path traversal, número de entradas, expansão máxima e limite por arquivo relevante |
| Assinaturas | `/data/signatures.json`, com fonte, chave, tamanho e modo de comparação declarados |
| Comparação | Valores completos e campos estruturados; não há busca global por substring |
| Resultado | `SIM`, `NÃO` ou `VERIFICAR MANUALMENTE`, sem score de risco |
| Plist binário | Detectado e informado como limitação; não é interpretado como se fosse XML |

Em aparelhos ou navegadores com pouca memória, arquivos grandes podem não conseguir ser processados mesmo abaixo de 350 MB. O aplicativo informa limites de leitura e formatos não interpretados no relatório, sem criar resultado simulado. Um identificador estruturado sem regra RX7 exata aparece em **VERIFICAR MANUALMENTE**; ele não é convertido em detecção.

## Desenvolvimento local

Instale as dependências e inicie a aplicação:

```bash
pnpm install
pnpm dev
```

Os comandos de verificação são:

```bash
pnpm check
pnpm test
pnpm build
```

O build estático é produzido em `dist/public`, incluindo o arquivo separado do Web Worker.

## Publicação na Netlify

O repositório já inclui `netlify.toml` com `pnpm build` e `dist/public`. Basta conectar a branch `master` à Netlify. Cada `git push` para essa branch dispara o novo build da aplicação estática. Consulte [NETLIFY_DEPLOY.md](./NETLIFY_DEPLOY.md) para o passo a passo.

## Validação atual

Foi validado no navegador um fixture TAR.GZ pequeno, contendo uma plist XML de teste, para confirmar o fluxo local do Web Worker, a apresentação do relatório e a normalização da árvore TAR. **Nenhum SYSdiagnose real autorizado foi usado nesta validação.** Um arquivo real deve ser testado separadamente antes de qualquer uso operacional.

## Referências

[1] [Netlify — Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/)

[2] [MDN — Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
