# Enviar Diagnose

Aplicação standalone e pública para envio de arquivos SYSdiagnose de iPhone/iOS. Ela aceita `.tar.gz`, `.tgz` e `.zip`, valida o formato e o cabeçalho do arquivo, processa entradas relevantes localmente no servidor e devolve um relatório contextual.

O projeto não contém interface de login, histórico, painel administrativo ou armazenamento permanente do arquivo. Os arquivos enviados são tratados como dados não confiáveis, não são executados e são eliminados no fim da solicitação.

## Execução local

Instale as dependências com `pnpm install` e inicie o ambiente com `pnpm dev`.

## Limites operacionais

O upload é limitado a 200 MB. A extração também limita o total de entradas, o volume expandido e o tamanho de cada arquivo relevante lido. Achados de sequências curtas ou isoladas continuam sendo baixa confiança e não produzem confirmação automática.
