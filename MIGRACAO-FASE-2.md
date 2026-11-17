# Passar da Fase 1 para a Fase 2

## Maneira mais segura

1. No terminal antigo, pressione `Ctrl + C` para parar a loja.
2. Não apague a pasta da Fase 1 ainda.
3. Extraia este ZIP em uma pasta nova, por exemplo:

```text
C:\aec-moda-loja-fase-2
```

4. Caso já tenha um arquivo `.env.local` na Fase 1, copie-o para a pasta nova.
5. Abra o PowerShell dentro da nova pasta e execute:

```powershell
npm install
```

Caso o npm mostre o aviso `allow-scripts`, execute:

```powershell
npm approve-scripts sharp unrs-resolver
npm rebuild sharp
```

6. Inicie a loja:

```powershell
npm run dev
```

## Endereços

- Loja: `http://localhost:3000`
- Painel: `http://localhost:3000/admin`

Se ainda não definiu `ADMIN_PASSWORD` no `.env.local`, durante o desenvolvimento a senha provisória será:

```text
aecmoda2026
```

## Primeiro teste recomendado

1. Entre no painel.
2. Clique em `Novo produto`.
3. Use uma foto de teste.
4. Escolha tamanhos e cores.
5. Preencha o estoque de cada combinação.
6. Publique.
7. Abra a loja e confirme se o produto apareceu.

## Antes de publicar na internet

O modo local salva os dados apenas neste computador. Antes do lançamento, conecte o Supabase seguindo o `README.md`, troque a senha provisória e defina uma chave longa em `ADMIN_SESSION_SECRET`.
