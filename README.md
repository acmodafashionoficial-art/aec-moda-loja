# A&C Moda — Fase 8.1 Contas individuais e 2FA

Loja virtual em Next.js com painel administrativo, produtos e imagens padronizados, estoque por variação, Supabase, frete real pelo Melhor Envio, retirada na loja e checkout integrado da InfinitePay.

Esta versão substitui o acesso compartilhado por contas individuais com senha própria, recuperação por e-mail e autenticação em duas etapas por aplicativo autenticador.

## Atualização da Fase 8

Extraia a Fase 8.1 em uma pasta nova e copie da Fase 8 somente:

- `.env.local`
- `data/products.json`
- `data/store-settings.json`
- `data/logistics-settings.json`
- `data/shipping-settings.json`
- `public/uploads`

Não copie `node_modules`, `.next`, `.private` ou `data/orders.json`.

Depois execute:

```powershell
npm install
npm run dev
```

Execute `MIGRACAO-FASE-8.1-CONTAS-2FA.sql` uma única vez no SQL Editor do Supabase.

Leia `GUIA-CONTAS-2FA-FASE-8.1.md` antes de enviar o primeiro convite.

## Endereços

- Loja: `http://localhost:3000`
- Painel: `http://localhost:3000/admin`
- Contas: `http://localhost:3000/admin/usuarios`
- Segurança: `http://localhost:3000/admin/seguranca`

## Verificação realizada

```powershell
npm run lint
npx next build --experimental-build-mode compile
npx next build --experimental-build-mode generate
```
