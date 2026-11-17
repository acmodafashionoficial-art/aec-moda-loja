# Ativar fretes reais — A&C Moda

## 1. Antes da conexão

No painel, abra **Pesos e embalagens** e confirme:

- peso médio de cada tipo de peça;
- medidas dobradas;
- peso e medidas das embalagens;
- margens de segurança.

Depois abra **Fretes e Correios** e preencha o CEP e os dados do remetente.

## 2. Criar o aplicativo no Melhor Envio

Crie primeiro um aplicativo no ambiente Sandbox. Cadastre exatamente a URL mostrada na tela `/admin/fretes` como URL de retorno.

Copie para `.env.local`:

```env
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_CALLBACK_URL=http://localhost:3000/api/admin/melhor-envio/callback
MELHOR_ENVIO_USER_AGENT=A&C Moda (email-real-da-loja@dominio.com.br)
INTEGRATION_ENCRYPTION_KEY=uma-chave-longa-e-aleatoria
```

Reinicie o servidor após alterar o `.env.local`.

## 3. Conectar e testar

1. Entre em `/admin/fretes`.
2. Mantenha o ambiente **Sandbox**.
3. Clique em **Conectar conta**.
4. Autorize o aplicativo.
5. Carregue os serviços.
6. Deixe PAC e SEDEX ativos.
7. Teste CEPs de Pernambuco, São Paulo, Santa Catarina e outras regiões.
8. Faça pedidos de teste com uma e várias peças.

## 4. Produção

Quando todos os testes estiverem corretos:

1. configure o domínio e HTTPS;
2. crie ou configure o aplicativo de Produção;
3. atualize a URL pública e a URL de retorno;
4. altere o ambiente para Produção e salve;
5. conecte novamente a conta;
6. faça uma compra real de pequeno valor;
7. confira o valor cotado, o pagamento e a postagem.

## Regras importantes

- Não compartilhe Client Secret, token, service role ou chaves de sessão.
- Não coloque segredos em variáveis `NEXT_PUBLIC_*`.
- Mantenha `ALLOW_DEMO_CHECKOUT=false` em produção.
- A retirada na loja deve ter endereço e instruções atualizados.
