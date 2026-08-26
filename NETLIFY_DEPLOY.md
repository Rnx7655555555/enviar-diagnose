# Guia de publicação do Enviar Diagnose na Netlify

Este repositório contém duas partes: o **frontend**, que a Netlify pode publicar, e o **backend Node**, responsável por receber e analisar os arquivos Sysdiagnose. A Netlify deve hospedar o frontend; o backend precisa ficar em um host Node separado para o scanner funcionar.

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

## 2. Publicar o backend Node

O endpoint `POST /api/public-scan` recebe arquivos e executa a análise segura. Uma publicação estática não executa esse endpoint. Publique o mesmo repositório em um host com suporte a processo Node, como Render, Railway ou outro serviço equivalente.

Na criação do serviço Node, use a branch `master` e informe:

| Campo do host Node | Valor |
|---|---|
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Node version | `22` |

Depois de o host fornecer a URL HTTPS do backend, adicione a variável abaixo no host Node. Troque pelo domínio real do seu site Netlify e não inclua barra no fim:

```dotenv
ALLOWED_ORIGIN=https://seu-site.netlify.app
```

Essa variável permite que somente o frontend indicado envie arquivos ao backend no navegador.

## 3. Ligar o frontend ao backend

Volte para a Netlify e abra **Project configuration → Environment variables**. Crie a variável de produção:

```dotenv
VITE_SCANNER_API_URL=https://url-publica-do-seu-backend
```

Use a URL HTTPS do backend, sem barra no fim. Esta variável é uma URL pública e será incluída no JavaScript do navegador; não coloque tokens, senhas ou chaves privadas nela.

Após salvar, abra **Deploys** e execute **Trigger deploy → Deploy site**. Variáveis de ambiente entram no frontend durante o build, portanto é obrigatório criar um novo deploy após alterá-las.

## 4. Testar antes de divulgar

1. Abra a URL da Netlify em uma janela anônima.
2. Escolha um arquivo Sysdiagnose `.tar.gz`, `.tgz` ou `.zip` de até 200 MB.
3. Clique em **Iniciar análise**.
4. Confirme que aparece o relatório com score, evidências e recomendações.
5. Teste um arquivo inválido; o sistema deve recusá-lo antes da análise.

Se o upload falhar com bloqueio de CORS, confira se `ALLOWED_ORIGIN` no backend é **idêntico** à URL exibida pela Netlify, usando `https://` e sem barra final. Se a página abrir, mas o botão de análise retornar erro de rede, confira `VITE_SCANNER_API_URL` e faça um novo deploy na Netlify.

## 5. Atualizações futuras

Sempre que houver uma alteração no projeto, faça `git push` para a branch `master`. Como a Netlify ficará conectada ao GitHub, ela executará um novo build e publicará a atualização automaticamente. O mesmo repositório pode ser usado pelo host Node para atualizar o backend.

> O `netlify.toml` já define o diretório público correto. Somente os arquivos em `dist/public` são publicados pela Netlify; o servidor Node não é incluído nesse deploy estático.

## Referências

[1] [Netlify — Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/)

[2] [Netlify — Get started with environment variables](https://docs.netlify.com/build/environment-variables/get-started/)
