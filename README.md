# Enviar Diagnose

Aplicação standalone e pública para envio de arquivos SYSdiagnose de iPhone/iOS. Ela aceita `.tar.gz`, `.tgz` e `.zip`, valida o formato e o cabeçalho do arquivo, processa entradas relevantes localmente no servidor e devolve um relatório contextual.

O projeto não contém interface de login, histórico, painel administrativo ou armazenamento permanente do arquivo. Os arquivos enviados são tratados como dados não confiáveis, não são executados e são eliminados no fim da solicitação.

## Execução local

Instale as dependências com `pnpm install` e inicie o ambiente com `pnpm dev`.

## Implantação com Netlify

A Netlify pode publicar automaticamente o **frontend** deste repositório a cada push no GitHub, usando o arquivo `netlify.toml`. Como o scanner recebe arquivos e processa `.tar.gz`/`.zip` no Node.js, a API não pode ser hospedada como site estático da Netlify. O frontend usa o backend Manus em `https://rx7sysdiag-wcpkppib.manus.space`, onde o endpoint `POST /api/public-scan` recebe, extrai e analisa o arquivo.

O `netlify.toml` já declara a URL pública do backend para o build. No backend Manus, a origem `https://rx7-scan-ios.netlify.app` é a única origem autorizada para chamadas do navegador ao endpoint público.

## Limites operacionais

O upload é limitado a 350 MB. A extração também limita o total de entradas, o volume expandido e o tamanho de cada arquivo relevante lido. Achados de sequências curtas ou isoladas continuam sendo baixa confiança e não produzem confirmação automática.
