# Xadrez online

## Supabase

1. Crie um projeto Supabase e execute [`database/schema.sql`](database/schema.sql) no SQL Editor.
2. Em **Authentication → URL Configuration**, configure o endereço do site do Vercel e adicione `https://SEU-DOMINIO/index.html` às URLs de redirecionamento. Para desenvolvimento, adicione `http://localhost:5173/index.html`.
3. Copie a URL e a chave publicável (ou `anon`) do projeto.
4. Mantenha o provedor de e-mail do Supabase Auth ativo. Com confirmação de e-mail habilitada, o cadastro informa ao jogador que ele precisa confirmar o endereço antes de entrar.

## Vercel

Importe o repositório no Vercel. O build usa Vite e publica o conteúdo de `dist/`. Configure estas variáveis no projeto:

| Variável | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto; usada pelo navegador |
| `VITE_SUPABASE_ANON_KEY` | Chave publicável/anon; usada pelo navegador |
| `SUPABASE_URL` | URL do projeto; usada pela função de partidas |
| `SUPABASE_ANON_KEY` | Chave publicável/anon; usada para validar sessões |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do servidor; **nunca** use o prefixo `VITE_` |

Adicione as variáveis e faça um novo deploy para que o Vite as inclua no site. Não publique nem compartilhe a chave secreta de servidor.

Contas criadas anteriormente no MySQL local não são transferidas automaticamente para o Supabase Auth; cada jogador precisa criar uma conta no novo projeto.

## Desenvolvimento local

```sh
npm install
npm run dev
```

Crie um arquivo `.env.local` com as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O jogo local funciona sem Supabase; cadastro, salas online e jogadas entre usuários precisam do projeto Supabase configurado.

## Testes

```sh
npm test
npm run build
```
