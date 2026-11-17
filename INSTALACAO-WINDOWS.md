# Instalação no Windows — A&C Moda Fase 4

1. Pare a versão anterior com `Ctrl + C`.
2. Extraia o ZIP em uma pasta nova, por exemplo `C:\\aec-moda-fase-4`.
3. Copie o `.env.local` da Fase 3 para a nova pasta, caso exista.
4. Para preservar cadastros locais, copie também `data\products.json` e `public\uploads`.
5. Abra o PowerShell na nova pasta e execute:

```powershell
npm install
npm run dev
```

Se o npm mostrar aviso de scripts:

```powershell
npm approve-scripts sharp unrs-resolver
npm rebuild sharp
```

## Endereços

- Loja: `http://localhost:3000`
- Painel: `http://localhost:3000/admin`
- Logística: `http://localhost:3000/admin/logistica`

## Primeiro teste

1. Entre em **Pesos e embalagens**.
2. Use o simulador com 1, 3 e 5 peças.
3. Edite um produto e selecione o tipo logístico adequado.
4. Adicione várias unidades ao carrinho.
5. Calcule o frete e confira a embalagem informada na opção de entrega.

Não compartilhe o arquivo `.env.local`, pois ele contém senhas e credenciais privadas.
