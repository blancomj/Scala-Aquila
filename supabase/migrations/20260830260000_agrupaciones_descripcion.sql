-- Nota libre sobre la agrupación ("Torre norte, acceso por la 45", "Etapa
-- entregada en 2019"). Nullable: la mayoría de nodos no la necesita — el
-- tipo + el nombre ya los identifican. No participa en ninguna regla ni
-- búsqueda todavía; es solo contexto para quien administra el árbol.
alter table public.agrupaciones add column descripcion text;

comment on column public.agrupaciones.descripcion is
  'Observación libre del administrador sobre la agrupación. No interviene en ninguna regla.';
