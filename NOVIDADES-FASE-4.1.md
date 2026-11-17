# A&C Moda — Correção de segurança do frete (Fase 4.1)

- Valores simulados deixam de aparecer por padrão.
- Sem token real do Melhor Envio, entrega fica bloqueada e retirada continua disponível.
- CEP inválido ou não localizado é rejeitado.
- Ao trocar o CEP, endereço e cotações antigas são apagados para evitar dados misturados.
- O checkout não aceita frete demonstrativo sem autorização técnica explícita.
- Para testes locais, use ALLOW_DEMO_SHIPPING=true e ALLOW_DEMO_CHECKOUT=true somente temporariamente.
