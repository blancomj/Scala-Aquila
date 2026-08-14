-- ═══════════════════════════════════════════════════════════════════════
--  Seed de catálogo de plataforma — importado de un proyecto anterior
--  Fuente: E:\proyectos\redension\Clases-tipos.sql (tablas `tipos` /
--  `tipos_generales`), a petición explícita de esta sesión.
--
--  Se importan las 27 familias de la fuente (de las 28 numeradas) y sus
--  valores, con dos exclusiones deliberadas:
--
--  1. La fila `('06','04','En el Limbo', tenant_id = '48f7bc79-...')` —
--     es un dato propio de un tenant en la base de origen, no de
--     plataforma; no aplica aquí (petición explícita del usuario).
--  2. La familia 27 "Estado Liquidación" (Pendiente/Procesando/Liquidada/
--     Error en Liquidación/Cerrada) — Aquila ya tiene una decisión cerrada
--     y distinta para eso: `liquidacion_estado_t` (D-14,
--     20260814110000_liquidaciones.sql), deliberadamente reducido a
--     ('completada','fallida') en vez de una máquina de 5+ estados.
--     Importar esta familia crearía vocabulario paralelo sin consumidor,
--     compitiendo con una decisión ya tomada. No se importa.
--
--  La familia 05 "Tipo de Predio" no se crea como familia nueva: se
--  fusiona dentro de TIPO_INMUEBLE (ya creada en
--  20260814160000_tipos_lista_tipos.sql) — son el mismo concepto con otro
--  nombre. Solo se añade 'terreno', el único valor que TIPO_INMUEBLE no
--  tenía todavía ('Bodega-Deposito' de la fuente ya es 'deposito' aquí).
--
--  Códigos de familia y de valor son texto significativo en minúsculas/
--  mayúsculas (no los 2 dígitos opacos de la fuente), consistente con
--  20260814160000. Ninguna de estas familias tiene todavía una tabla de
--  dominio que la consuma — es contenido de catálogo por delante de su
--  consumidor, mismo patrón que TIPO_INMUEBLE/TIPO_ZONA_COMUN al crearse.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre) values
  ('PERSONA_PREDIO', 'Rol de Persona en el Predio'),
  ('PERSONA_COPROPIEDAD', 'Rol de Persona en la Copropiedad'),
  ('TIPO_SEGUIMIENTO', 'Tipo de Seguimiento'),
  ('ESTADO_FACTURA', 'Estado de Factura'),
  ('ESTADO_GENERAL', 'Estado General'),
  ('TIPO_IDENTIFICACION', 'Tipo de Documento de Identificación'),
  ('ESTADO_PREDIO', 'Estado del Predio (cobro)'),
  ('HABITABILIDAD_PREDIO', 'Habitabilidad del Predio'),
  ('USO_PREDIO', 'Uso del Predio'),
  ('TIPO_DOCUMENTO_PREDIO', 'Tipo de Documento del Predio'),
  ('ROL_CONCEJO_COPROPIEDAD', 'Rol en el Concejo de la Copropiedad'),
  ('RECURRENCIA_COBRO', 'Recurrencia de Cobro'),
  ('PERIODICIDAD_COBRO', 'Periodicidad de Cobro'),
  ('FILTRO_ITEM_COBRO', 'Filtro de Alcance de Item de Cobro'),
  ('TIPO_PERSONA', 'Tipo de Persona (Natural/Jurídica)'),
  ('TIPO_GRAVAMEN', 'Tipo de Gravamen del Predio'),
  ('PORCENTAJE_IVA', 'Porcentaje de I.V.A.'),
  ('VALOR_ITEM_FACTURABLE', 'Forma de Valorar un Item Facturable'),
  ('TIPO_PARAMETRO', 'Tipo de Dato de un Parámetro'),
  ('TIPO_NOVEDAD', 'Tipo de Novedad Facturable'),
  ('ESTADO_NOVEDAD', 'Estado de Novedad Facturable'),
  ('AGRUPACION_PREDIOS', 'Nivel de Agrupación de Predios'),
  ('FIGURA_JURIDICA', 'Figura Jurídica de la Administración'),
  ('ESTADO_PAGO', 'Estado de Pago'),
  ('FORMA_PAGO', 'Forma de Pago'),
  ('TIPO_CARTERA', 'Tipo de Cobro de Cartera');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  -- PERSONA_PREDIO
  ('PERSONA_PREDIO', 'copropietario', 'Copropietario', 1),
  ('PERSONA_PREDIO', 'arrendatario', 'Arrendatario', 2),
  ('PERSONA_PREDIO', 'inquilino', 'Inquilino', 3),
  ('PERSONA_PREDIO', 'visitante', 'Visitante', 4),
  ('PERSONA_PREDIO', 'apoderado', 'Apoderado', 5),
  ('PERSONA_PREDIO', 'codeudor', 'Codeudor', 6),

  -- PERSONA_COPROPIEDAD
  ('PERSONA_COPROPIEDAD', 'administrador', 'Administrador', 1),
  ('PERSONA_COPROPIEDAD', 'auditor_revisor_fiscal', 'Auditor / Revisor Fiscal', 2),
  ('PERSONA_COPROPIEDAD', 'abogado', 'Abogado', 3),
  ('PERSONA_COPROPIEDAD', 'contador', 'Contador', 4),

  -- TIPO_SEGUIMIENTO
  ('TIPO_SEGUIMIENTO', 'llamada', 'Llamada', 1),
  ('TIPO_SEGUIMIENTO', 'carta', 'Carta', 2),
  ('TIPO_SEGUIMIENTO', 'requerimiento', 'Requerimiento', 3),
  ('TIPO_SEGUIMIENTO', 'acuerdo', 'Acuerdo', 4),

  -- ESTADO_FACTURA
  ('ESTADO_FACTURA', 'pendiente', 'Pendiente', 1),
  ('ESTADO_FACTURA', 'pagada', 'Pagada', 2),
  ('ESTADO_FACTURA', 'en_mora', 'En mora', 3),

  -- ESTADO_GENERAL (En el Limbo excluido — era dato propio de un tenant en la fuente)
  ('ESTADO_GENERAL', 'activo', 'Activo', 1),
  ('ESTADO_GENERAL', 'inactivo', 'Inactivo', 2),
  ('ESTADO_GENERAL', 'suspendido', 'Suspendido', 3),
  ('ESTADO_GENERAL', 'reparado', 'Reparado', 4),

  -- TIPO_IDENTIFICACION
  ('TIPO_IDENTIFICACION', 'cedula', 'Cédula', 1),
  ('TIPO_IDENTIFICACION', 'nit', 'N.I.T.', 2),
  ('TIPO_IDENTIFICACION', 'pasaporte', 'Pasaporte', 3),
  ('TIPO_IDENTIFICACION', 'tarjeta_identidad', 'Tarjeta de Identidad', 4),
  ('TIPO_IDENTIFICACION', 'cedula_extranjeria', 'Cédula de Extranjería', 5),

  -- ESTADO_PREDIO
  ('ESTADO_PREDIO', 'al_dia', 'Al Día', 1),
  ('ESTADO_PREDIO', 'en_mora', 'En Mora', 2),
  ('ESTADO_PREDIO', 'moroso_cronico', 'Moroso Crónico', 3),
  ('ESTADO_PREDIO', 'acuerdo_pago', 'Acuerdo de Pago', 4),
  ('ESTADO_PREDIO', 'exento', 'Exento', 5),

  -- HABITABILIDAD_PREDIO
  ('HABITABILIDAD_PREDIO', 'habitado', 'Habitado', 1),
  ('HABITABILIDAD_PREDIO', 'en_mantenimiento', 'En Mantenimiento', 2),
  ('HABITABILIDAD_PREDIO', 'litigio_disputa_legal', 'Litigio / Disputa Legal', 3),
  ('HABITABILIDAD_PREDIO', 'no_habitado', 'No Habitado', 4),
  ('HABITABILIDAD_PREDIO', 'inactivo_sin_titular', 'Inactivo / Sin Titular', 5),
  ('HABITABILIDAD_PREDIO', 'inhabitable', 'Inhabitable', 6),

  -- USO_PREDIO
  ('USO_PREDIO', 'residencial', 'Residencial', 1),
  ('USO_PREDIO', 'comercial', 'Comercial', 2),
  ('USO_PREDIO', 'turistico', 'Turístico', 3),
  ('USO_PREDIO', 'industrial', 'Industrial', 4),
  ('USO_PREDIO', 'institucional', 'Institucional', 5),

  -- TIPO_DOCUMENTO_PREDIO
  ('TIPO_DOCUMENTO_PREDIO', 'escritura_publica', 'Escritura pública', 1),
  ('TIPO_DOCUMENTO_PREDIO', 'certificado_libertad_tradicion', 'Cert. de libertad y tradición', 2),
  ('TIPO_DOCUMENTO_PREDIO', 'licencia_construccion', 'Licencia de construcción', 3),
  ('TIPO_DOCUMENTO_PREDIO', 'planos_croquis', 'Planos / croquis del predio', 4),
  ('TIPO_DOCUMENTO_PREDIO', 'paz_y_salvo', 'Paz y Salvo', 5),
  ('TIPO_DOCUMENTO_PREDIO', 'informe_mantenimiento', 'Informe de mantenimiento', 6),
  ('TIPO_DOCUMENTO_PREDIO', 'recibo_servicios_publicos', 'Recibo de servicios públicos', 7),
  ('TIPO_DOCUMENTO_PREDIO', 'otro_documento', 'Otro documento', 8),

  -- ROL_CONCEJO_COPROPIEDAD
  ('ROL_CONCEJO_COPROPIEDAD', 'presidente', 'Presidente', 1),
  ('ROL_CONCEJO_COPROPIEDAD', 'vicepresidente', 'Vicepresidente', 2),
  ('ROL_CONCEJO_COPROPIEDAD', 'secretario', 'Secretario', 3),
  ('ROL_CONCEJO_COPROPIEDAD', 'vocal', 'Vocal', 4),
  ('ROL_CONCEJO_COPROPIEDAD', 'suplente', 'Suplente', 5),

  -- RECURRENCIA_COBRO
  ('RECURRENCIA_COBRO', 'recurrente', 'Recurrente', 1),
  ('RECURRENCIA_COBRO', 'unico', 'Único', 2),
  ('RECURRENCIA_COBRO', 'periodo_tiempo', 'Periodo de Tiempo', 3),
  ('RECURRENCIA_COBRO', 'novedad', 'Novedad', 4),

  -- PERIODICIDAD_COBRO
  ('PERIODICIDAD_COBRO', 'mensual', 'Mensual', 1),
  ('PERIODICIDAD_COBRO', 'trimestral', 'Trimestral', 2),
  ('PERIODICIDAD_COBRO', 'semestral', 'Semestral', 3),
  ('PERIODICIDAD_COBRO', 'anual', 'Anual', 4),

  -- FILTRO_ITEM_COBRO
  ('FILTRO_ITEM_COBRO', 'todos', 'Todos', 1),
  ('FILTRO_ITEM_COBRO', 'condicional', 'Condicional', 2),

  -- TIPO_PERSONA
  ('TIPO_PERSONA', 'natural', 'Natural', 1),
  ('TIPO_PERSONA', 'juridica', 'Jurídica', 2),

  -- TIPO_GRAVAMEN
  ('TIPO_GRAVAMEN', 'ninguno', 'Ninguno', 1),
  ('TIPO_GRAVAMEN', 'hipotecario', 'Hipotecario', 2),
  ('TIPO_GRAVAMEN', 'leasing', 'Leasing', 3),

  -- PORCENTAJE_IVA
  ('PORCENTAJE_IVA', '0%', '0%', 1),
  ('PORCENTAJE_IVA', '5%', '5%', 2),
  ('PORCENTAJE_IVA', '10%', '10%', 3),
  ('PORCENTAJE_IVA', '19%', '19%', 4),

  -- VALOR_ITEM_FACTURABLE
  ('VALOR_ITEM_FACTURABLE', 'valor_fijo', 'Valor Fijo', 1),
  ('VALOR_ITEM_FACTURABLE', 'formula', 'Fórmula', 2),

  -- TIPO_PARAMETRO
  ('TIPO_PARAMETRO', 'texto', 'Texto', 1),
  ('TIPO_PARAMETRO', 'texto_largo', 'Texto Largo', 2),
  ('TIPO_PARAMETRO', 'numerico', 'Numérico', 3),
  ('TIPO_PARAMETRO', 'fecha', 'Fecha', 4),
  ('TIPO_PARAMETRO', 'logico', 'Lógico', 5),

  -- TIPO_NOVEDAD
  ('TIPO_NOVEDAD', 'saldo_anterior', 'Saldo Anterior', 1),
  ('TIPO_NOVEDAD', 'sancion', 'Sanción', 2),
  ('TIPO_NOVEDAD', 'intereses_mora', 'Intereses Mora', 3),
  ('TIPO_NOVEDAD', 'reparaciones', 'Reparaciones', 4),
  ('TIPO_NOVEDAD', 'servicios', 'Servicios', 5),
  ('TIPO_NOVEDAD', 'uso_amenidad', 'Uso Amenidad', 6),
  ('TIPO_NOVEDAD', 'pago_terceros', 'Pago a Terceros', 7),
  ('TIPO_NOVEDAD', 'gastos_cobranza', 'Gastos de Cobranza', 8),

  -- ESTADO_NOVEDAD
  ('ESTADO_NOVEDAD', 'pendiente', 'Pendiente', 1),
  ('ESTADO_NOVEDAD', 'por_aprobar', 'Por Aprobar', 2),
  ('ESTADO_NOVEDAD', 'aprobada', 'Aprobada', 3),
  ('ESTADO_NOVEDAD', 'aplicada', 'Aplicada', 4),
  ('ESTADO_NOVEDAD', 'anulada', 'Anulada', 5),
  ('ESTADO_NOVEDAD', 'pagada', 'Pagada', 6),
  ('ESTADO_NOVEDAD', 'vencida_mora', 'Vencida - Mora', 7),
  ('ESTADO_NOVEDAD', 'suspendida', 'Suspendida', 8),
  ('ESTADO_NOVEDAD', 'en_disputa_reclamo', 'En Disputa - Reclamo', 9),
  ('ESTADO_NOVEDAD', 'compensada', 'Compensada', 10),
  ('ESTADO_NOVEDAD', 'cobro_coactivo', 'Cobro Coactivo', 11),
  ('ESTADO_NOVEDAD', 'expirada', 'Expirada', 12),

  -- AGRUPACION_PREDIOS (duplicado 'Bloque' de la fuente, descartado)
  ('AGRUPACION_PREDIOS', 'bloque', 'Bloque', 1),
  ('AGRUPACION_PREDIOS', 'edificio', 'Edificio', 2),
  ('AGRUPACION_PREDIOS', 'zona', 'Zona', 3),
  ('AGRUPACION_PREDIOS', 'manzana', 'Manzana', 4),
  ('AGRUPACION_PREDIOS', 'piso', 'Piso', 5),
  ('AGRUPACION_PREDIOS', 'etapa', 'Etapa', 6),
  ('AGRUPACION_PREDIOS', 'unidad', 'Unidad', 7),
  ('AGRUPACION_PREDIOS', 'nivel', 'Nivel', 8),

  -- FIGURA_JURIDICA
  ('FIGURA_JURIDICA', 'condominio_ph', 'Condominio o Propiedad Horizontal', 1),
  ('FIGURA_JURIDICA', 'empresa_privada', 'Empresa privada', 2),
  ('FIGURA_JURIDICA', 'organizacion_sin_fines', 'Organización sin fines de lucro', 3),
  ('FIGURA_JURIDICA', 'entidad_publica', 'Entidad pública', 4),
  ('FIGURA_JURIDICA', 'cooperativa_mutual', 'Cooperativa o mutual', 5),

  -- ESTADO_PAGO
  ('ESTADO_PAGO', 'pendiente', 'Pendiente', 1),
  ('ESTADO_PAGO', 'pagado', 'Pagado', 2),
  ('ESTADO_PAGO', 'abonado', 'Abonado', 3),
  ('ESTADO_PAGO', 'vencido', 'Vencido', 4),

  -- FORMA_PAGO
  ('FORMA_PAGO', 'efectivo', 'Efectivo', 1),
  ('FORMA_PAGO', 'transferencia_bancaria', 'Transferencia Bancaria', 2),
  ('FORMA_PAGO', 'pse', 'PSE', 3),
  ('FORMA_PAGO', 'debito_automatico', 'Débito Automático', 4),
  ('FORMA_PAGO', 'nota_debito', 'Nota Débito', 5),

  -- TIPO_CARTERA
  ('TIPO_CARTERA', 'ordinaria', 'Ordinaria', 1),
  ('TIPO_CARTERA', 'cobro_administrativo', 'Cobro Administrativo', 2),
  ('TIPO_CARTERA', 'cobro_prejuridico', 'Cobro Prejurídico', 3),
  ('TIPO_CARTERA', 'cobro_ejecutivo', 'Cobro Ejecutivo', 4);

-- ── Fusión con TIPO_INMUEBLE existente (§ ver comentario de cabecera) ───
insert into public.lista_tipos (tipo, codigo, nombre, orden)
values ('TIPO_INMUEBLE', 'terreno', 'Terreno', 8);
