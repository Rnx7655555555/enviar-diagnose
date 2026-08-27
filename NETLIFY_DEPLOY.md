# Publicar o Enviar Diagnose na Netlify

O **Enviar Diagnose** é uma aplicação estática. A Netlify hospeda apenas os arquivos do frontend; o SYSdiagnose é aberto e analisado no navegador de quem o seleciona. Não há URL de backend, configuração CORS ou variável de API a informar para o scanner funcionar.

## Conectar o GitHub

1. Entre em [Netlify](https://app.netlify.com/) com a conta vinculada ao GitHub.
2. Escolha **Add new project** e depois **Import an existing project**.
3. Selecione o repositório `Rnx7655555555/enviar-diagnose` e a branch `master`.
4. Confirme os valores abaixo e escolha **Deploy site**.

| Campo na Netlify | Valor |
|---|---|
| Base directory | deixe em branco |
| Build command | `pnpm build` |
| Publish directory | `dist/public` |
| Node version | `22` |

O arquivo `netlify.toml` já contém essas opções. O endereço atualmente configurado para a publicação é `https://rx7-scan-ios.netlify.app`.

## Atualizações

Após modificar o projeto localmente, execute as verificações e envie a alteração para o GitHub:

```bash
pnpm check
pnpm test
pnpm build
git add .
git commit -m "Atualiza scanner local"
git push origin master
```

Com a integração GitHub–Netlify ativa, o push inicia um novo deploy automaticamente. Na aba **Deploys** da Netlify, aguarde o estado **Published** antes de compartilhar a versão atualizada.

## Teste depois da publicação

Abra o site em janela privada, selecione um `.tar.gz`, `.tgz` ou `.zip` de até 350 MB e inicie a análise. Durante o processamento, a tela deve informar a etapa, os bytes lidos e os arquivos relevantes já analisados. Ao final, confira o relatório, a árvore do arquivo e as exportações JSON, TXT e PDF.

> Faça o primeiro teste com um arquivo de que você tenha autorização para tratar. A fixture usada durante o desenvolvimento confirma a integração técnica do fluxo, mas não equivale à validação com um SYSdiagnose real.

## Referências

[1] [Netlify — Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/)

[2] [Netlify — Deploys from Git](https://docs.netlify.com/site-deploys/create-deploys/)
