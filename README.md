# Enviar Diagnose

Aplicação standalone e pública para envio de arquivos SYSdiagnose de iPhone/iOS. Ela aceita `.tar.gz`, `.tgz` e `.zip`, valida o formato e o cabeçalho do arquivo, processa entradas relevantes localmente no servidor e devolve um relatório contextual.

O projeto não contém interface de login, histórico, painel administrativo ou armazenamento permanente do arquivo. Os arquivos enviados são tratados como dados não confiáveis, não são executados e são eliminados no fim da solicitação.

## Execução local

Instale as dependências com `pnpm install` e inicie o ambiente com `pnpm dev`.

## Implantação com Netlify

A Netlify pode publicar automaticamente o **frontend** deste repositório a cada push no GitHub, usando o arquivo `netlify.toml`. Como o scanner recebe arquivos e processa `.tar.gz`/`.zip` no Node.js, a API não pode ser hospedada como site estático da Netlify.

Publique este mesmo projeto em um host Node compatível para executar `pnpm build` e `pnpm start`. Em seguida, configure no frontend da Netlify a variável `VITE_SCANNER_API_URL` com a URL HTTPS desse backend e, no backend, a variável `ALLOWED_ORIGIN` com a URL do site Netlify. O arquivo `.env.example` contém os nomes esperados.

> Sem um backend Node para a rota `POST /api/public-scan`, a página da Netlify exibirá a interface, mas não conseguirá analisar arquivos. A separação é necessária para preservar o processamento seguro no servidor.

## Limites operacionais

O upload é limitado a 200 MB. A extração também limita o total de entradas, o volume expandido e o tamanho de cada arquivo relevante lido. Achados de sequências curtas ou isoladas continuam sendo baixa confiança e não produzem confirmação automática.
