# Instalação segura — Fase 8

## 1. Atualizar a pasta

Extraia a Fase 8 em uma pasta nova e copie da Fase 7 apenas:

- `.env.local`
- `data/products.json`
- `data/store-settings.json`
- `data/logistics-settings.json`
- `data/shipping-settings.json`
- `public/uploads`

Não copie `node_modules`, `.next` ou arquivos de pedidos locais.

## 2. Instalar

```powershell
npm install
```

## 3. Gerar nova senha e segredos

Como credenciais apareceram durante os testes anteriores, gere tudo novamente:

```powershell
npm run security:generate
```

O terminal esconderá a senha enquanto você digita. Copie os quatro valores para o `.env.local` e remova a linha `ADMIN_PASSWORD=`.

## 4. Atualizar o Supabase

No SQL Editor, abra uma nova consulta, cole todo o conteúdo de:

```text
MIGRACAO-FASE-8-SEGURANCA.sql
```

Clique em **Run** uma única vez.

## 5. Trocar integrações expostas

Revogue e gere novamente o token do Melhor Envio usado nos testes. Não envie tokens, chaves ou o `.env.local` por mensagens.

## 6. Iniciar e conferir

```powershell
npm run dev
```

Abra:

```text
http://localhost:3000/admin/seguranca
```

Todos os itens obrigatórios devem aparecer como concluídos antes de publicar.

## 7. Verificações técnicas

```powershell
npm run lint
npm run build
npm run security:audit
```

## Regras para produção

- Use somente `ADMIN_PASSWORD_HASH`, nunca `ADMIN_PASSWORD`.
- Cadastre os segredos nas variáveis protegidas da hospedagem.
- Use `https://aecmoda.com.br` em `NEXT_PUBLIC_SITE_URL`.
- Mantenha `ALLOW_DEMO_CHECKOUT=false`.
- Não publique `.env.local`, `.private`, backups ou logs.
- Não ative pagamentos até o checklist de segurança ficar verde.
