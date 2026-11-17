# Fase 6.1 — correção da migração de produtos antigos

Corrige o erro `invalid input syntax for type uuid: "body-vinho"` durante a migração para o Supabase.

Produtos criados nas fases locais antigas usavam identificadores legíveis, como `body-vinho`. No banco do Supabase, os identificadores são UUID. A migração agora:

- detecta IDs locais antigos;
- deixa o Supabase gerar um UUID válido;
- usa o `slug` para tornar novas tentativas de migração seguras;
- mantém os UUIDs dos produtos que já foram migrados;
- pode ser executada novamente sem duplicar produtos com o mesmo slug.
