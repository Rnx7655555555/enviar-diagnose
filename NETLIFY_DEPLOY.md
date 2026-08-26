# Guia de publicação do Enviar Diagnose na Netlify

Este repositório contém o **frontend**, que a Netlify publica. O backend Manus é responsável por receber e analisar os arquivos Sysdiagnose. A Netlify hospeda somente a interface pública, enquanto o endpoint de análise fica no projeto Manus.

## 1. Conectar o GitHub à Netlify

1. Acesse [Netlify](https://app.netlify.com/) e entre com sua conta GitHub.
2. Clique em **Add new project** e depois em **Import an existing project**.
3. Escolha **GitHub**, autorize a Netlify a acessar seus repositórios quando ela solicitar e selecione `Rnx7655555/enviar-diagnose`.
4. Mantenha a branch de produção como `master`.

O repositório já possui o arquivo `netlify.toml`; portanto, a Netlify deve usar automaticamente os valores abaixo:

| Campo da Netlify | Valor |
|---|---|
| Base directory | deixe vazio |
| Build command | `pnpm build` |
| Publish directory | `dist/public` |
| Node version | `22` |

Clique em **Deploy site**. Quando terminar, copie a URL atribuída pela Netlify, por exemplo `https://seu-site.netlify.app`.

## 2. Backend Manus

O endpoint `POST /api/public-scan` fica no backend Manus, em `https://rx7sysdiag-wcpkppib.manus.space`. Ele recebe o arquivo, valida o formato, extrai de forma limitada e executa a análise. O domínio Netlify `https://rx7-scan-ios.netlify.app` está autorizado no backend Manus para chamadas do navegador.

## 3. Ligar o frontend ao backend

O `netlify.toml` já define `VITE_SCANNER_API_URL=https://rx7sysdiag-wcpkppib.manus.space` durante o build. Não é necessário criar essa variável manualmente na Netlify. Depois do próximo `git push`, a Netlify recompila o site com a URL correta.

## 4. Testar antes de divulgar

1. Abra a URL da Netlify em uma janela anônima.
2. Escolha um arquivo Sysdiagnose `.tar.gz`, `.tgz` ou `.zip` de até 350 MB.
3. Clique em **Iniciar análise**.
4. Confirme que aparece o relatório com score, evidências e recomendações.
5. Teste um arquivo inválido; o sistema deve recusá-lo antes da análise.

Se o upload falhar com bloqueio de CORS, confira se a URL do site continua sendo `https://rx7-scan-ios.netlify.app`. Se você trocar de domínio Netlify, a origem autorizada precisa ser atualizada no backend Manus. Se a página abrir, mas o botão de análise retornar erro de rede, confira os logs do projeto Manus e faça um novo deploy na Netlify.

## 5. Atualizações futuras

Sempre que houver uma alteração no frontend, faça `git push` para a branch `master`. Como a Netlify está conectada ao GitHub, ela executará um novo build e publicará a atualização automaticamente. Alterações no motor de análise são publicadas pelo projeto Manus.

> O `netlify.toml` já define o diretório público correto. Somente os arquivos em `dist/public` são publicados pela Netlify; o servidor Node não é incluído nesse deploy estático.

## Referências

[1] [Netlify — Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/)

[2] [Netlify — Get started with environment variables](https://docs.netlify.com/build/environment-variables/get-started/)
