export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      acciones_cobranza: {
        Row: {
          alcance: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at: string | null
          aprobada_por: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id: string | null
          clasificacion_codigo: string
          contenido_hash: string | null
          creada_por: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at: string
          destinatario_contacto: string | null
          destinatario_rol_codigo: string
          destinatario_tercero_id: string
          deuda_total_al_momento: number
          dias_mora_al_momento: number
          ejecutada_por: string | null
          estado: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          grupo_envio_id: string | null
          id: string
          inmueble_id: string
          intento_numero: number
          notas: string | null
          plantilla_codigo: string | null
          politica_clasificacion_id: string
          politica_version: number
          propuesta_por: string | null
          referencia_externa: string | null
          resultado:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha: string | null
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at?: string | null
          aprobada_por?: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id?: string | null
          clasificacion_codigo: string
          contenido_hash?: string | null
          creada_por: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at?: string
          destinatario_contacto?: string | null
          destinatario_rol_codigo: string
          destinatario_tercero_id: string
          deuda_total_al_momento: number
          dias_mora_al_momento: number
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada: string
          grupo_envio_id?: string | null
          id?: string
          inmueble_id: string
          intento_numero?: number
          notas?: string | null
          plantilla_codigo?: string | null
          politica_clasificacion_id: string
          politica_version: number
          propuesta_por?: string | null
          referencia_externa?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha?: string | null
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Update: {
          alcance?: Database["public"]["Enums"]["alcance_accion_cobranza_t"]
          aprobada_at?: string | null
          aprobada_por?: string | null
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          cargo_id?: string | null
          clasificacion_codigo?: string
          contenido_hash?: string | null
          creada_por?: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          created_at?: string
          destinatario_contacto?: string | null
          destinatario_rol_codigo?: string
          destinatario_tercero_id?: string
          deuda_total_al_momento?: number
          dias_mora_al_momento?: number
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          estrategia_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada?: string
          grupo_envio_id?: string | null
          id?: string
          inmueble_id?: string
          intento_numero?: number
          notas?: string | null
          plantilla_codigo?: string | null
          politica_clasificacion_id?: string
          politica_version?: number
          propuesta_por?: string | null
          referencia_externa?: string | null
          resultado?:
            | Database["public"]["Enums"]["resultado_accion_cobranza_t"]
            | null
          resultado_fecha?: string | null
          tenant_id?: string
          tipo_accion?: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
        }
        Relationships: [
          {
            foreignKeyName: "acciones_cobranza_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_destinatario_tercero_id_fkey"
            columns: ["destinatario_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_ejecutada_por_fkey"
            columns: ["ejecutada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_estrategia_id_fkey"
            columns: ["estrategia_id"]
            isOneToOne: false
            referencedRelation: "estrategias_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_politica_clasificacion_id_fkey"
            columns: ["politica_clasificacion_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acciones_cobranza_acuses: {
        Row: {
          created_at: string
          documento_id: string | null
          envio_id: string
          estado: Database["public"]["Enums"]["estado_acuse_t"]
          id: string
          motivo: string | null
          ocurrido_at: string
          origen: Database["public"]["Enums"]["origen_acuse_t"]
          payload_crudo: Json | null
          recibido_at: string
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          envio_id: string
          estado: Database["public"]["Enums"]["estado_acuse_t"]
          id?: string
          motivo?: string | null
          ocurrido_at: string
          origen: Database["public"]["Enums"]["origen_acuse_t"]
          payload_crudo?: Json | null
          recibido_at?: string
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          envio_id?: string
          estado?: Database["public"]["Enums"]["estado_acuse_t"]
          id?: string
          motivo?: string | null
          ocurrido_at?: string
          origen?: Database["public"]["Enums"]["origen_acuse_t"]
          payload_crudo?: Json | null
          recibido_at?: string
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acciones_cobranza_acuses_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_acuses_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_acuses_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_acuses_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_acuses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_acuses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acciones_cobranza_envios: {
        Row: {
          accion_id: string | null
          asunto: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          contenido_hash: string
          contenido_renderizado: string
          created_at: string
          destinatario_contacto: string
          destinatario_tercero_id: string | null
          enviado_at: string
          enviado_por: string | null
          es_automatico: boolean
          id: string
          intento_numero: number
          origen_entidad: string | null
          origen_evento: string | null
          origen_id: string | null
          origen_modulo: string | null
          plantilla_codigo: string
          plantilla_version: number
          proveedor: string
          referencia_externa: string | null
          tenant_id: string
        }
        Insert: {
          accion_id?: string | null
          asunto?: string | null
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          contenido_hash: string
          contenido_renderizado: string
          created_at?: string
          destinatario_contacto: string
          destinatario_tercero_id?: string | null
          enviado_at?: string
          enviado_por?: string | null
          es_automatico?: boolean
          id?: string
          intento_numero: number
          origen_entidad?: string | null
          origen_evento?: string | null
          origen_id?: string | null
          origen_modulo?: string | null
          plantilla_codigo: string
          plantilla_version: number
          proveedor: string
          referencia_externa?: string | null
          tenant_id: string
        }
        Update: {
          accion_id?: string | null
          asunto?: string | null
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          contenido_hash?: string
          contenido_renderizado?: string
          created_at?: string
          destinatario_contacto?: string
          destinatario_tercero_id?: string | null
          enviado_at?: string
          enviado_por?: string | null
          es_automatico?: boolean
          id?: string
          intento_numero?: number
          origen_entidad?: string | null
          origen_evento?: string | null
          origen_id?: string | null
          origen_modulo?: string | null
          plantilla_codigo?: string
          plantilla_version?: number
          proveedor?: string
          referencia_externa?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acciones_cobranza_envios_accion_id_fkey"
            columns: ["accion_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_envios_destinatario_tercero_id_fkey"
            columns: ["destinatario_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_envios_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acciones_cobranza_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_estado_historial: {
        Row: {
          activo_id: string
          created_at: string
          documento_id: string | null
          estado_anterior: Database["public"]["Enums"]["activo_estado_t"] | null
          estado_nuevo: Database["public"]["Enums"]["activo_estado_t"]
          id: string
          motivo: string | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          activo_id: string
          created_at?: string
          documento_id?: string | null
          estado_anterior?:
            | Database["public"]["Enums"]["activo_estado_t"]
            | null
          estado_nuevo: Database["public"]["Enums"]["activo_estado_t"]
          id?: string
          motivo?: string | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          activo_id?: string
          created_at?: string
          documento_id?: string | null
          estado_anterior?:
            | Database["public"]["Enums"]["activo_estado_t"]
            | null
          estado_nuevo?: Database["public"]["Enums"]["activo_estado_t"]
          id?: string
          motivo?: string | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_estado_historial_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_estado_historial_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_estado_historial_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_estado_historial_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_estado_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_estado_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activos: {
        Row: {
          activo_padre_id: string | null
          agrupacion_id: string | null
          atributos: Json
          capitalizado: boolean
          categoria_id: number
          centro_costo_id: number | null
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          descripcion: string | null
          documento_soporte_id: string | null
          estado: Database["public"]["Enums"]["activo_estado_t"]
          fabricante: string | null
          fecha_adquisicion: string | null
          fecha_inicio_depreciacion: string | null
          fecha_instalacion: string | null
          fecha_puesta_servicio: string | null
          fecha_retiro: string | null
          id: string
          imagen_documento_id: string | null
          marca: string | null
          metodo_depreciacion:
            | Database["public"]["Enums"]["depreciacion_metodo_t"]
            | null
          modelo: string | null
          naturaleza_bien: Database["public"]["Enums"]["activo_naturaleza_bien_t"]
          nombre: string
          numero_serie: string | null
          origen: Database["public"]["Enums"]["activo_origen_t"]
          qr_token: string | null
          tenant_id: string
          tipo_id: number
          ubicacion_detalle: string | null
          updated_at: string | null
          valor_adquisicion: number | null
          valor_residual: number
          vida_util_meses: number | null
          zona_comun_id: string | null
        }
        Insert: {
          activo_padre_id?: string | null
          agrupacion_id?: string | null
          atributos?: Json
          capitalizado?: boolean
          categoria_id: number
          centro_costo_id?: number | null
          codigo: string
          contable_cuenta_id?: string | null
          created_at?: string
          descripcion?: string | null
          documento_soporte_id?: string | null
          estado?: Database["public"]["Enums"]["activo_estado_t"]
          fabricante?: string | null
          fecha_adquisicion?: string | null
          fecha_inicio_depreciacion?: string | null
          fecha_instalacion?: string | null
          fecha_puesta_servicio?: string | null
          fecha_retiro?: string | null
          id?: string
          imagen_documento_id?: string | null
          marca?: string | null
          metodo_depreciacion?:
            | Database["public"]["Enums"]["depreciacion_metodo_t"]
            | null
          modelo?: string | null
          naturaleza_bien: Database["public"]["Enums"]["activo_naturaleza_bien_t"]
          nombre: string
          numero_serie?: string | null
          origen: Database["public"]["Enums"]["activo_origen_t"]
          qr_token?: string | null
          tenant_id: string
          tipo_id: number
          ubicacion_detalle?: string | null
          updated_at?: string | null
          valor_adquisicion?: number | null
          valor_residual?: number
          vida_util_meses?: number | null
          zona_comun_id?: string | null
        }
        Update: {
          activo_padre_id?: string | null
          agrupacion_id?: string | null
          atributos?: Json
          capitalizado?: boolean
          categoria_id?: number
          centro_costo_id?: number | null
          codigo?: string
          contable_cuenta_id?: string | null
          created_at?: string
          descripcion?: string | null
          documento_soporte_id?: string | null
          estado?: Database["public"]["Enums"]["activo_estado_t"]
          fabricante?: string | null
          fecha_adquisicion?: string | null
          fecha_inicio_depreciacion?: string | null
          fecha_instalacion?: string | null
          fecha_puesta_servicio?: string | null
          fecha_retiro?: string | null
          id?: string
          imagen_documento_id?: string | null
          marca?: string | null
          metodo_depreciacion?:
            | Database["public"]["Enums"]["depreciacion_metodo_t"]
            | null
          modelo?: string | null
          naturaleza_bien?: Database["public"]["Enums"]["activo_naturaleza_bien_t"]
          nombre?: string
          numero_serie?: string | null
          origen?: Database["public"]["Enums"]["activo_origen_t"]
          qr_token?: string | null
          tenant_id?: string
          tipo_id?: number
          ubicacion_detalle?: string | null
          updated_at?: string | null
          valor_adquisicion?: number | null
          valor_residual?: number
          vida_util_meses?: number | null
          zona_comun_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activos_activo_padre_id_fkey"
            columns: ["activo_padre_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_documento_soporte_id_fkey"
            columns: ["documento_soporte_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_documento_soporte_id_fkey"
            columns: ["documento_soporte_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_imagen_documento_id_fkey"
            columns: ["imagen_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_imagen_documento_id_fkey"
            columns: ["imagen_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      actor_externo_otp: {
        Row: {
          canal: string
          codigo_hash: string
          contacto: string
          creado_at: string
          expira_at: string
          id: string
          intentos: number
          usado_at: string | null
        }
        Insert: {
          canal: string
          codigo_hash: string
          contacto: string
          creado_at?: string
          expira_at: string
          id?: string
          intentos?: number
          usado_at?: string | null
        }
        Update: {
          canal?: string
          codigo_hash?: string
          contacto?: string
          creado_at?: string
          expira_at?: string
          id?: string
          intentos?: number
          usado_at?: string | null
        }
        Relationships: []
      }
      actor_externo_paso_reforzado: {
        Row: {
          accion: string
          auth_user_id: string
          codigo_hash: string
          confirmado_at: string | null
          contexto_id: string
          creado_at: string
          expira_at: string
          id: string
          intentos: number
        }
        Insert: {
          accion: string
          auth_user_id: string
          codigo_hash: string
          confirmado_at?: string | null
          contexto_id: string
          creado_at?: string
          expira_at: string
          id?: string
          intentos?: number
        }
        Update: {
          accion?: string
          auth_user_id?: string
          codigo_hash?: string
          confirmado_at?: string | null
          contexto_id?: string
          creado_at?: string
          expira_at?: string
          id?: string
          intentos?: number
        }
        Relationships: []
      }
      actor_externo_vinculo: {
        Row: {
          auth_user_id: string
          creado_at: string
          creado_por: string | null
          id: string
          origen: Database["public"]["Enums"]["actor_externo_origen_t"]
          persona_rol_id: string
          persona_tipo: Database["public"]["Enums"]["actor_externo_persona_t"]
          tenant_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          auth_user_id: string
          creado_at?: string
          creado_por?: string | null
          id?: string
          origen: Database["public"]["Enums"]["actor_externo_origen_t"]
          persona_rol_id: string
          persona_tipo: Database["public"]["Enums"]["actor_externo_persona_t"]
          tenant_id: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          auth_user_id?: string
          creado_at?: string
          creado_por?: string | null
          id?: string
          origen?: Database["public"]["Enums"]["actor_externo_origen_t"]
          persona_rol_id?: string
          persona_tipo?: Database["public"]["Enums"]["actor_externo_persona_t"]
          tenant_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actor_externo_vinculo_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_externo_vinculo_persona_rol_id_fkey"
            columns: ["persona_rol_id"]
            isOneToOne: false
            referencedRelation: "inmueble_persona_rol"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_externo_vinculo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_externo_vinculo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acuerdo_pago_cuotas: {
        Row: {
          acuerdo_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago: string | null
          fecha_vencimiento: string
          id: string
          monto: number
          monto_pagado: number
          numero_cuota: number
          tenant_id: string
        }
        Insert: {
          acuerdo_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago?: string | null
          fecha_vencimiento: string
          id?: string
          monto: number
          monto_pagado?: number
          numero_cuota: number
          tenant_id: string
        }
        Update: {
          acuerdo_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cuota_acuerdo_t"]
          fecha_pago?: string | null
          fecha_vencimiento?: string
          id?: string
          monto?: number
          monto_pagado?: number
          numero_cuota?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuerdo_pago_cuotas_acuerdo_id_fkey"
            columns: ["acuerdo_id"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdo_pago_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdo_pago_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acuerdos_pago: {
        Row: {
          acta_referencia: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          condona_interes: boolean
          consecutivo: string | null
          created_at: string
          cuota_inicial: number
          documento_id: string | null
          estado: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo: string
          fecha_fin: string
          fecha_incumplimiento: string | null
          fecha_inicio: string
          id: string
          inmueble_id: string
          interes_durante_acuerdo: boolean
          monto_capital: number
          monto_condonado: number
          monto_interes: number
          monto_otros: number
          monto_total: number
          motivo_incumplimiento: string | null
          numero_cuotas: number
          propuesto_por: string | null
          tenant_id: string
        }
        Insert: {
          acta_referencia?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          condona_interes?: boolean
          consecutivo?: string | null
          created_at?: string
          cuota_inicial?: number
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo: string
          fecha_fin: string
          fecha_incumplimiento?: string | null
          fecha_inicio: string
          id?: string
          inmueble_id: string
          interes_durante_acuerdo?: boolean
          monto_capital?: number
          monto_condonado?: number
          monto_interes?: number
          monto_otros?: number
          monto_total: number
          motivo_incumplimiento?: string | null
          numero_cuotas: number
          propuesto_por?: string | null
          tenant_id: string
        }
        Update: {
          acta_referencia?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          condona_interes?: boolean
          consecutivo?: string | null
          created_at?: string
          cuota_inicial?: number
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["estado_acuerdo_t"]
          etapa_congelada?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          fecha_acuerdo?: string
          fecha_fin?: string
          fecha_incumplimiento?: string | null
          fecha_inicio?: string
          id?: string
          inmueble_id?: string
          interes_durante_acuerdo?: boolean
          monto_capital?: number
          monto_condonado?: number
          monto_interes?: number
          monto_otros?: number
          monto_total?: number
          motivo_incumplimiento?: string | null
          numero_cuotas?: number
          propuesto_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acuerdos_pago_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acuerdos_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agrupaciones: {
        Row: {
          activa: boolean
          busqueda_tsv: unknown
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          parent_id: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          parent_id?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          parent_id?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agrupaciones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncio_audiencia: {
        Row: {
          anuncio_id: string
          criterio: string
          id: string
          valor: string | null
        }
        Insert: {
          anuncio_id: string
          criterio: string
          id?: string
          valor?: string | null
        }
        Update: {
          anuncio_id?: string
          criterio?: string
          id?: string
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncio_audiencia_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncio_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncio_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncio_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncio_lectura: {
        Row: {
          anuncio_id: string
          confirmado_at: string | null
          leido_at: string
          user_id: string
        }
        Insert: {
          anuncio_id: string
          confirmado_at?: string | null
          leido_at?: string
          user_id: string
        }
        Update: {
          anuncio_id?: string
          confirmado_at?: string | null
          leido_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anuncio_lectura_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios: {
        Row: {
          anio: number | null
          categoria_id: number
          contenido: string
          creado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["anuncio_estado_t"]
          id: string
          motivo_rechazo: string | null
          numero: number | null
          prioridad_id: number
          publicado_at: string | null
          publicado_por: string | null
          publicar_at: string | null
          requiere_confirmacion: boolean
          resumen: string | null
          revisado_at: string | null
          revisado_por: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          anio?: number | null
          categoria_id: number
          contenido: string
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["anuncio_estado_t"]
          id?: string
          motivo_rechazo?: string | null
          numero?: number | null
          prioridad_id: number
          publicado_at?: string | null
          publicado_por?: string | null
          publicar_at?: string | null
          requiere_confirmacion?: boolean
          resumen?: string | null
          revisado_at?: string | null
          revisado_por?: string | null
          tenant_id: string
          titulo: string
          updated_at?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          anio?: number | null
          categoria_id?: number
          contenido?: string
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["anuncio_estado_t"]
          id?: string
          motivo_rechazo?: string | null
          numero?: number | null
          prioridad_id?: number
          publicado_at?: string | null
          publicado_por?: string | null
          publicar_at?: string | null
          requiere_confirmacion?: boolean
          resumen?: string | null
          revisado_at?: string | null
          revisado_por?: string | null
          tenant_id?: string
          titulo?: string
          updated_at?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atencion_tokens_consulta: {
        Row: {
          created_at: string
          expira_at: string
          generado_por: string | null
          id: string
          inmueble_id: string
          motivo_revocacion: string | null
          revocado_at: string | null
          revocado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          expira_at: string
          generado_por?: string | null
          id?: string
          inmueble_id: string
          motivo_revocacion?: string | null
          revocado_at?: string | null
          revocado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          expira_at?: string
          generado_por?: string | null
          id?: string
          inmueble_id?: string
          motivo_revocacion?: string | null
          revocado_at?: string | null
          revocado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atencion_tokens_consulta_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atencion_tokens_consulta_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atencion_tokens_consulta_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atencion_tokens_consulta_revocado_por_fkey"
            columns: ["revocado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atencion_tokens_consulta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atencion_tokens_consulta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: unknown
          metadata: Json
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: unknown
          metadata?: Json
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: unknown
          metadata?: Json
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_acciones: {
        Row: {
          accion: string
          created_at: string
          created_by: string
          estado: string
          evidencia_cierre: string[] | null
          fecha_compromiso: string | null
          fecha_inicio: string | null
          hallazgo_id: string
          id: string
          prioridad: string | null
          responsable: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          created_by: string
          estado?: string
          evidencia_cierre?: string[] | null
          fecha_compromiso?: string | null
          fecha_inicio?: string | null
          hallazgo_id: string
          id?: string
          prioridad?: string | null
          responsable?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          created_by?: string
          estado?: string
          evidencia_cierre?: string[] | null
          fecha_compromiso?: string | null
          fecha_inicio?: string | null
          hallazgo_id?: string
          id?: string
          prioridad?: string | null
          responsable?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_acciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_acciones_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_hallazgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_acciones_responsable_fkey"
            columns: ["responsable"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_acciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_acciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_catalogo_riesgos: {
        Row: {
          activo: boolean
          categoria: string
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      auditoria_controles: {
        Row: {
          automatizado: boolean
          busqueda_tsv: unknown
          codigo_automatico: string | null
          created_at: string
          created_by: string
          evidencia: string[] | null
          frecuencia: string | null
          id: string
          manual: boolean
          nombre: string
          objetivo: string | null
          proceso: string | null
          responsable: string | null
          riesgo_id: string
          tenant_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          automatizado?: boolean
          busqueda_tsv?: unknown
          codigo_automatico?: string | null
          created_at?: string
          created_by: string
          evidencia?: string[] | null
          frecuencia?: string | null
          id?: string
          manual?: boolean
          nombre: string
          objetivo?: string | null
          proceso?: string | null
          responsable?: string | null
          riesgo_id: string
          tenant_id: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          automatizado?: boolean
          busqueda_tsv?: unknown
          codigo_automatico?: string | null
          created_at?: string
          created_by?: string
          evidencia?: string[] | null
          frecuencia?: string | null
          id?: string
          manual?: boolean
          nombre?: string
          objetivo?: string | null
          proceso?: string | null
          responsable?: string | null
          riesgo_id?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_controles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_controles_riesgo_id_fkey"
            columns: ["riesgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_riesgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_controles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_controles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_ejecuciones: {
        Row: {
          conclusion: string | null
          created_at: string
          ejecutado_at: string
          ejecutado_por: string | null
          engagement_id: string
          evidencia: string[] | null
          id: string
          observaciones: string | null
          origen: string
          procedimiento_id: string | null
          resultado: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          conclusion?: string | null
          created_at?: string
          ejecutado_at?: string
          ejecutado_por?: string | null
          engagement_id: string
          evidencia?: string[] | null
          id?: string
          observaciones?: string | null
          origen?: string
          procedimiento_id?: string | null
          resultado?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          conclusion?: string | null
          created_at?: string
          ejecutado_at?: string
          ejecutado_por?: string | null
          engagement_id?: string
          evidencia?: string[] | null
          id?: string
          observaciones?: string | null
          origen?: string
          procedimiento_id?: string | null
          resultado?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_ejecuciones_ejecutado_por_fkey"
            columns: ["ejecutado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_ejecuciones_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "auditoria_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_ejecuciones_procedimiento_id_fkey"
            columns: ["procedimiento_id"]
            isOneToOne: false
            referencedRelation: "auditoria_procedimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_ejecuciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_ejecuciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_engagements: {
        Row: {
          alcance: string | null
          conclusion: string | null
          created_at: string
          created_by: string | null
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          objetivo: string | null
          origen_id: string | null
          origen_tipo: string | null
          periodo: string | null
          prioridad: string | null
          responsable: string | null
          tenant_id: string
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          alcance?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          objetivo?: string | null
          origen_id?: string | null
          origen_tipo?: string | null
          periodo?: string | null
          prioridad?: string | null
          responsable?: string | null
          tenant_id: string
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          alcance?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          objetivo?: string | null
          origen_id?: string | null
          origen_tipo?: string | null
          periodo?: string | null
          prioridad?: string | null
          responsable?: string | null
          tenant_id?: string
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_engagements_responsable_fkey"
            columns: ["responsable"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_engagements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_engagements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_evidencias: {
        Row: {
          archivo_path: string | null
          busqueda_tsv: unknown
          created_at: string
          descripcion: string | null
          fecha: string
          hallazgo_id: string
          hash: string | null
          id: string
          origen: string | null
          tenant_id: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          archivo_path?: string | null
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          fecha?: string
          hallazgo_id: string
          hash?: string | null
          id?: string
          origen?: string | null
          tenant_id: string
          tipo: string
          usuario_id: string
        }
        Update: {
          archivo_path?: string | null
          busqueda_tsv?: unknown
          created_at?: string
          descripcion?: string | null
          fecha?: string
          hallazgo_id?: string
          hash?: string | null
          id?: string
          origen?: string | null
          tenant_id?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_evidencias_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_hallazgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_evidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_evidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_evidencias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_hallazgos: {
        Row: {
          busqueda_tsv: unknown
          causa: string | null
          causa_comun: string | null
          causa_raiz: string | null
          condicion: string | null
          control_id: string | null
          created_at: string
          created_by: string
          criterio: string | null
          efecto: string | null
          engagement_id: string
          estado: string
          evidencia: string[] | null
          fecha_compromiso: string | null
          hallazgo_anterior_id: string | null
          id: string
          nivel: string
          proceso: string
          recomendacion: string | null
          reincidente: boolean
          responsable: string | null
          riesgo_id: string | null
          riesgo_version_utilizada: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          busqueda_tsv?: unknown
          causa?: string | null
          causa_comun?: string | null
          causa_raiz?: string | null
          condicion?: string | null
          control_id?: string | null
          created_at?: string
          created_by: string
          criterio?: string | null
          efecto?: string | null
          engagement_id: string
          estado?: string
          evidencia?: string[] | null
          fecha_compromiso?: string | null
          hallazgo_anterior_id?: string | null
          id?: string
          nivel?: string
          proceso: string
          recomendacion?: string | null
          reincidente?: boolean
          responsable?: string | null
          riesgo_id?: string | null
          riesgo_version_utilizada?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          busqueda_tsv?: unknown
          causa?: string | null
          causa_comun?: string | null
          causa_raiz?: string | null
          condicion?: string | null
          control_id?: string | null
          created_at?: string
          created_by?: string
          criterio?: string | null
          efecto?: string | null
          engagement_id?: string
          estado?: string
          evidencia?: string[] | null
          fecha_compromiso?: string | null
          hallazgo_anterior_id?: string | null
          id?: string
          nivel?: string
          proceso?: string
          recomendacion?: string | null
          reincidente?: boolean
          responsable?: string | null
          riesgo_id?: string | null
          riesgo_version_utilizada?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_hallazgos_control_id_fkey"
            columns: ["control_id"]
            isOneToOne: false
            referencedRelation: "auditoria_controles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "auditoria_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_hallazgo_anterior_id_fkey"
            columns: ["hallazgo_anterior_id"]
            isOneToOne: false
            referencedRelation: "auditoria_hallazgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_responsable_fkey"
            columns: ["responsable"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_riesgo_id_fkey"
            columns: ["riesgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_riesgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_hallazgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_muestras: {
        Row: {
          cantidad: number
          created_at: string
          created_by: string
          criterio: string
          ejecucion_id: string
          id: string
          poblacion: number
          seleccion: string[] | null
          semilla: number | null
          tenant_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          created_by: string
          criterio: string
          ejecucion_id: string
          id?: string
          poblacion: number
          seleccion?: string[] | null
          semilla?: number | null
          tenant_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          created_by?: string
          criterio?: string
          ejecucion_id?: string
          id?: string
          poblacion?: number
          seleccion?: string[] | null
          semilla?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_muestras_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_muestras_ejecucion_id_fkey"
            columns: ["ejecucion_id"]
            isOneToOne: false
            referencedRelation: "auditoria_ejecuciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_muestras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_muestras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_normativa: {
        Row: {
          created_at: string
          created_by: string
          criterio: string
          engagement_id: string
          evidencia: string[] | null
          fundamento_normativo_id: number
          id: string
          observaciones: string | null
          resultado: string
          tenant_id: string
          updated_at: string | null
          vigencia: string
        }
        Insert: {
          created_at?: string
          created_by: string
          criterio: string
          engagement_id: string
          evidencia?: string[] | null
          fundamento_normativo_id: number
          id?: string
          observaciones?: string | null
          resultado?: string
          tenant_id: string
          updated_at?: string | null
          vigencia: string
        }
        Update: {
          created_at?: string
          created_by?: string
          criterio?: string
          engagement_id?: string
          evidencia?: string[] | null
          fundamento_normativo_id?: number
          id?: string
          observaciones?: string | null
          resultado?: string
          tenant_id?: string
          updated_at?: string | null
          vigencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_normativa_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_normativa_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "auditoria_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_normativa_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_normativa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_normativa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_plan_items: {
        Row: {
          created_at: string
          created_by: string
          engagement_id: string | null
          frecuencia: string | null
          id: string
          periodo: string | null
          plan_id: string
          prioridad: string
          proceso: string | null
          responsable: string | null
          riesgo_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          engagement_id?: string | null
          frecuencia?: string | null
          id?: string
          periodo?: string | null
          plan_id: string
          prioridad: string
          proceso?: string | null
          responsable?: string | null
          riesgo_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          engagement_id?: string | null
          frecuencia?: string | null
          id?: string
          periodo?: string | null
          plan_id?: string
          prioridad?: string
          proceso?: string | null
          responsable?: string | null
          riesgo_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_plan_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "auditoria_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "auditoria_planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_responsable_fkey"
            columns: ["responsable"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_riesgo_id_fkey"
            columns: ["riesgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_riesgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_plan_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_planes: {
        Row: {
          anio: number
          aprobado_at: string | null
          aprobado_por: string | null
          created_at: string
          created_by: string
          estado: string
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          created_by: string
          estado?: string
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_planes_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_planes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_planes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_planes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_procedimientos: {
        Row: {
          control_id: string
          created_at: string
          created_by: string
          criterio: string
          criterio_muestreo: string | null
          id: string
          nombre: string
          objetivo: string | null
          prueba_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          control_id: string
          created_at?: string
          created_by: string
          criterio: string
          criterio_muestreo?: string | null
          id?: string
          nombre: string
          objetivo?: string | null
          prueba_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          control_id?: string
          created_at?: string
          created_by?: string
          criterio?: string
          criterio_muestreo?: string | null
          id?: string
          nombre?: string
          objetivo?: string | null
          prueba_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_procedimientos_control_id_fkey"
            columns: ["control_id"]
            isOneToOne: false
            referencedRelation: "auditoria_controles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_procedimientos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_procedimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_procedimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_riesgo_residual_historial: {
        Row: {
          accion_id: string | null
          created_at: string
          created_by: string
          id: string
          impacto: number
          motivo: string
          probabilidad: number
          riesgo_id: string
          riesgo_residual: number | null
          tenant_id: string
        }
        Insert: {
          accion_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          impacto: number
          motivo: string
          probabilidad: number
          riesgo_id: string
          riesgo_residual?: number | null
          tenant_id: string
        }
        Update: {
          accion_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          impacto?: number
          motivo?: string
          probabilidad?: number
          riesgo_id?: string
          riesgo_residual?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_riesgo_residual_historial_accion_id_fkey"
            columns: ["accion_id"]
            isOneToOne: false
            referencedRelation: "auditoria_acciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgo_residual_historial_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgo_residual_historial_riesgo_id_fkey"
            columns: ["riesgo_id"]
            isOneToOne: false
            referencedRelation: "auditoria_riesgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgo_residual_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgo_residual_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_riesgos: {
        Row: {
          busqueda_tsv: unknown
          categoria: string
          created_at: string
          created_by: string
          descripcion: string | null
          id: string
          impacto: number
          nombre: string
          prioridad: string | null
          probabilidad: number
          riesgo_inherente: number | null
          tenant_id: string
          updated_at: string | null
          version: number
        }
        Insert: {
          busqueda_tsv?: unknown
          categoria: string
          created_at?: string
          created_by: string
          descripcion?: string | null
          id?: string
          impacto: number
          nombre: string
          prioridad?: string | null
          probabilidad: number
          riesgo_inherente?: number | null
          tenant_id: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          busqueda_tsv?: unknown
          categoria?: string
          created_at?: string
          created_by?: string
          descripcion?: string | null
          id?: string
          impacto?: number
          nombre?: string
          prioridad?: string | null
          probabilidad?: number
          riesgo_inherente?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_riesgos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_riesgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_tipo_auditoria: {
        Row: {
          activo: boolean
          area: string | null
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          area?: string | null
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          area?: string | null
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      cargos: {
        Row: {
          cargo_capital_origen_id: string | null
          cargo_reversado_id: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id: string | null
          created_at: string
          fecha_vencimiento: string | null
          id: string
          inmueble_id: string
          liquidacion_linea_id: string | null
          monto_original: number
          novedad_id: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          reserva_id: string | null
          tenant_id: string
        }
        Insert: {
          cargo_capital_origen_id?: string | null
          cargo_reversado_id?: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          id?: string
          inmueble_id: string
          liquidacion_linea_id?: string | null
          monto_original: number
          novedad_id?: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          reserva_id?: string | null
          tenant_id: string
        }
        Update: {
          cargo_capital_origen_id?: string | null
          cargo_reversado_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          id?: string
          inmueble_id?: string
          liquidacion_linea_id?: string | null
          monto_original?: number
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id?: string
          reserva_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_reversado_id_fkey"
            columns: ["cargo_reversado_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_reversado_id_fkey"
            columns: ["cargo_reversado_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_liquidacion_linea_id_fkey"
            columns: ["liquidacion_linea_id"]
            isOneToOne: false
            referencedRelation: "liquidacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "mant_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cartera_corridas_diarias: {
        Row: {
          disparado_at: string
          fecha_corte: string
          id: string
          origen: string
          tenant_id: string
        }
        Insert: {
          disparado_at?: string
          fecha_corte: string
          id?: string
          origen?: string
          tenant_id: string
        }
        Update: {
          disparado_at?: string
          fecha_corte?: string
          id?: string
          origen?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartera_corridas_diarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_corridas_diarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cartera_etapas: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior: Database["public"]["Enums"]["etapa_cobranza_t"] | null
          etapa_propuesta:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id: string
          inmueble_id: string
          motivo_propuesta: string | null
          propuesto_at: string | null
          propuesto_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          etapa_propuesta?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id?: string
          inmueble_id: string
          motivo_propuesta?: string | null
          propuesto_at?: string | null
          propuesto_por?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_anterior?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          etapa_propuesta?:
            | Database["public"]["Enums"]["etapa_cobranza_t"]
            | null
          id?: string
          inmueble_id?: string
          motivo_propuesta?: string | null
          propuesto_at?: string | null
          propuesto_por?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cartera_etapas_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartera_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      caso_juridico_actuaciones: {
        Row: {
          caso_id: string
          created_at: string
          descripcion: string
          documento_id: string | null
          estado_desde:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha: string
          id: string
          registrada_por: string | null
          tenant_id: string
          tipo_actuacion_id: number
        }
        Insert: {
          caso_id: string
          created_at?: string
          descripcion: string
          documento_id?: string | null
          estado_desde?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha: string
          id?: string
          registrada_por?: string | null
          tenant_id: string
          tipo_actuacion_id: number
        }
        Update: {
          caso_id?: string
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          estado_desde?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          estado_hasta?:
            | Database["public"]["Enums"]["estado_caso_juridico_t"]
            | null
          fecha?: string
          id?: string
          registrada_por?: string | null
          tenant_id?: string
          tipo_actuacion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "caso_juridico_actuaciones_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_juridico_actuaciones_tipo_actuacion_id_fkey"
            columns: ["tipo_actuacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      casos_juridicos: {
        Row: {
          abogado_tercero_id: string | null
          aprobado_at: string
          aprobado_por: string | null
          busqueda_tsv: unknown
          certificacion_id: string
          ciudad: string | null
          consecutivo: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura: string | null
          fecha_cierre: string | null
          fecha_pretension: string
          fecha_proxima_actuacion: string | null
          fecha_remision: string
          fecha_ultima_actuacion: string | null
          id: string
          inmueble_id: string
          juzgado: string | null
          monto_pretension: number
          monto_recuperado: number
          motivo_cierre: string | null
          numero_radicado: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          abogado_tercero_id?: string | null
          aprobado_at?: string
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          certificacion_id: string
          ciudad?: string | null
          consecutivo?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_pretension: string
          fecha_proxima_actuacion?: string | null
          fecha_remision: string
          fecha_ultima_actuacion?: string | null
          id?: string
          inmueble_id: string
          juzgado?: string | null
          monto_pretension: number
          monto_recuperado?: number
          motivo_cierre?: string | null
          numero_radicado?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          abogado_tercero_id?: string | null
          aprobado_at?: string
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          certificacion_id?: string
          ciudad?: string | null
          consecutivo?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso_juridico_t"]
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          fecha_pretension?: string
          fecha_proxima_actuacion?: string | null
          fecha_remision?: string
          fecha_ultima_actuacion?: string | null
          id?: string
          inmueble_id?: string
          juzgado?: string | null
          monto_pretension?: number
          monto_recuperado?: number
          motivo_cierre?: string | null
          numero_radicado?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_juridicos_abogado_tercero_id_fkey"
            columns: ["abogado_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_certificacion_id_fkey"
            columns: ["certificacion_id"]
            isOneToOne: false
            referencedRelation: "certificaciones_deuda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_juridicos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      certificaciones_deuda: {
        Row: {
          anulada_at: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          cargo_firmante: string
          certificacion_hash: string
          consecutivo: string
          created_at: string
          detalle_cargos: Json
          documento_url: string | null
          estado: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por: string | null
          fecha_corte: string
          fecha_expedicion: string
          id: string
          inmueble_id: string
          monto_expensas_extraordinarias: number
          monto_expensas_ordinarias: number
          monto_intereses_mora: number
          monto_otros: number
          monto_sanciones: number
          monto_total: number
          politica_financiera_id: string
          politica_version: number
          tenant_id: string
        }
        Insert: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cargo_firmante: string
          certificacion_hash: string
          consecutivo: string
          created_at?: string
          detalle_cargos: Json
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por?: string | null
          fecha_corte: string
          fecha_expedicion: string
          id?: string
          inmueble_id: string
          monto_expensas_extraordinarias?: number
          monto_expensas_ordinarias?: number
          monto_intereses_mora?: number
          monto_otros?: number
          monto_sanciones?: number
          monto_total: number
          politica_financiera_id: string
          politica_version: number
          tenant_id: string
        }
        Update: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          cargo_firmante?: string
          certificacion_hash?: string
          consecutivo?: string
          created_at?: string
          detalle_cargos?: Json
          documento_url?: string | null
          estado?: Database["public"]["Enums"]["estado_certificacion_t"]
          expedida_por?: string | null
          fecha_corte?: string
          fecha_expedicion?: string
          id?: string
          inmueble_id?: string
          monto_expensas_extraordinarias?: number
          monto_expensas_ordinarias?: number
          monto_intereses_mora?: number
          monto_otros?: number
          monto_sanciones?: number
          monto_total?: number
          politica_financiera_id?: string
          politica_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificaciones_deuda_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_expedida_por_fkey"
            columns: ["expedida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_politica_financiera_id_fkey"
            columns: ["politica_financiera_id"]
            isOneToOne: false
            referencedRelation: "politicas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaciones_deuda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coeficiente_sets: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          suma_total: number
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          suma_total: number
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          suma_total?: number
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coeficiente_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficiente_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coeficientes: {
        Row: {
          created_at: string
          id: string
          inmueble_id: string
          set_id: string
          tenant_id: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          inmueble_id: string
          set_id: string
          tenant_id: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          id?: string
          inmueble_id?: string
          set_id?: string
          tenant_id?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "coeficientes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "coeficiente_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coeficientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      concepto_test_cases: {
        Row: {
          concepto_id: string
          created_at: string
          created_by: string
          entradas: Json
          id: string
          nombre: string
          resultado_esperado: Json | null
          tenant_id: string
          tipo_esperado: string
        }
        Insert: {
          concepto_id: string
          created_at?: string
          created_by: string
          entradas?: Json
          id?: string
          nombre: string
          resultado_esperado?: Json | null
          tenant_id: string
          tipo_esperado: string
        }
        Update: {
          concepto_id?: string
          created_at?: string
          created_by?: string
          entradas?: Json
          id?: string
          nombre?: string
          resultado_esperado?: Json | null
          tenant_id?: string
          tipo_esperado?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepto_test_cases_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_test_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      concepto_versiones: {
        Row: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones: Json | null
          concepto_id: string
          created_at: string
          created_by: string
          criterio_distribucion: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio: number | null
          fecha_fin_mes: number | null
          fecha_inicio_anio: number | null
          fecha_inicio_mes: number | null
          formula_ael: string | null
          hash: string
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad: number
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo: number | null
          version: number
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones?: Json | null
          concepto_id: string
          created_at?: string
          created_by: string
          criterio_distribucion?: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          hash: string
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad: number
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
          version?: number
        }
        Update: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"] | null
          alcance_condiciones?: Json | null
          concepto_id?: string
          created_at?: string
          created_by?: string
          criterio_distribucion?: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          estado_concepto?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          hash?: string
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor?: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre?: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          prioridad?: number
          tenant_id?: string
          tipo_recurrencia?: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "concepto_versiones_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepto_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos: {
        Row: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones: Json | null
          aprobado_at: string | null
          aprobado_por: string | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          criterio_distribucion: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          enviado_a_revision_at: string | null
          enviado_a_revision_por: string | null
          estado: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio: number | null
          fecha_fin_mes: number | null
          fecha_inicio_anio: number | null
          fecha_inicio_mes: number | null
          formula_ael: string | null
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id: string | null
          prioridad: number
          rechazado_motivo: string | null
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at: string | null
          valor_fijo: number | null
          version: number
        }
        Insert: {
          alcance: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones?: Json | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          criterio_distribucion?: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id?: string | null
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id: string
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at?: string | null
          valor_fijo?: number | null
          version?: number
        }
        Update: {
          alcance?: Database["public"]["Enums"]["concepto_alcance_t"]
          alcance_condiciones?: Json | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          criterio_distribucion?: Database["public"]["Enums"]["concepto_criterio_distribucion_t"]
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          fecha_fin_anio?: number | null
          fecha_fin_mes?: number | null
          fecha_inicio_anio?: number | null
          fecha_inicio_mes?: number | null
          formula_ael?: string | null
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor?: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre?: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_id?: string | null
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id?: string
          tipo_recurrencia?: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          updated_at?: string | null
          valor_fijo?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "conceptos_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_enviado_a_revision_por_fkey"
            columns: ["enviado_a_revision_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conceptos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos_plantilla: {
        Row: {
          codigo: string
          created_at: string
          formula_ael: string | null
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_codigo: string | null
          prioridad: number
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo: number | null
        }
        Insert: {
          codigo: string
          created_at?: string
          formula_ael?: string | null
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_codigo?: string | null
          prioridad?: number
          tipo_recurrencia: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
        }
        Update: {
          codigo?: string
          created_at?: string
          formula_ael?: string | null
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          modo_valor?: Database["public"]["Enums"]["concepto_modo_valor_t"]
          nombre?: string
          periodicidad?:
            | Database["public"]["Enums"]["concepto_periodicidad_t"]
            | null
          presupuesto_cuenta_codigo?: string | null
          prioridad?: number
          tipo_recurrencia?: Database["public"]["Enums"]["concepto_tipo_recurrencia_t"]
          valor_fijo?: number | null
        }
        Relationships: []
      }
      conciliacion_propuesta: {
        Row: {
          created_at: string
          explicacion: Json
          id: string
          inmueble_id: string
          linea_id: string
          metodo: Database["public"]["Enums"]["conciliacion_metodo_t"]
          score: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          explicacion: Json
          id?: string
          inmueble_id: string
          linea_id: string
          metodo: Database["public"]["Enums"]["conciliacion_metodo_t"]
          score: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          explicacion?: Json
          id?: string
          inmueble_id?: string
          linea_id?: string
          metodo?: Database["public"]["Enums"]["conciliacion_metodo_t"]
          score?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_propuesta_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_propuesta_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_propuesta_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "extracto_linea"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_propuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_propuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consecutivos_documento: {
        Row: {
          created_at: string
          digitos: number
          id: string
          prefijo: string
          siguiente_numero: number
          tenant_id: string
          tipo_documento: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          digitos?: number
          id?: string
          prefijo?: string
          siguiente_numero?: number
          tenant_id: string
          tipo_documento: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          digitos?: number
          id?: string
          prefijo?: string
          siguiente_numero?: number
          tenant_id?: string
          tipo_documento?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consecutivos_documento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consecutivos_documento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_castigo_cartera: {
        Row: {
          acta_referencia_texto: string | null
          autorizado_at: string | null
          autorizado_por: string | null
          creado_por: string | null
          created_at: string
          decision_id: string | null
          id: string
          inmueble_id: string
          monto: number
          motivo: string | null
          tenant_id: string
        }
        Insert: {
          acta_referencia_texto?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          creado_por?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          inmueble_id: string
          monto: number
          motivo?: string | null
          tenant_id: string
        }
        Update: {
          acta_referencia_texto?: string | null
          autorizado_at?: string | null
          autorizado_por?: string | null
          creado_por?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          inmueble_id?: string
          monto?: number
          motivo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_castigo_cartera_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_castigo_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_certificacion: {
        Row: {
          administrador_documento: string | null
          administrador_nombre: string
          certificado_at: string
          certificado_por: string
          contador_nombre: string | null
          contador_tarjeta_profesional: string | null
          contador_tercero_id: string | null
          documento_id: string | null
          ejercicio: number
          estados_incluidos: string[]
          fecha_corte: string
          hash_contenido: string
          id: string
          invalidada: boolean
          invalidada_at: string | null
          invalidada_motivo: string | null
          tenant_id: string
          texto_certificacion: string
        }
        Insert: {
          administrador_documento?: string | null
          administrador_nombre: string
          certificado_at?: string
          certificado_por: string
          contador_nombre?: string | null
          contador_tarjeta_profesional?: string | null
          contador_tercero_id?: string | null
          documento_id?: string | null
          ejercicio: number
          estados_incluidos: string[]
          fecha_corte: string
          hash_contenido: string
          id?: string
          invalidada?: boolean
          invalidada_at?: string | null
          invalidada_motivo?: string | null
          tenant_id: string
          texto_certificacion: string
        }
        Update: {
          administrador_documento?: string | null
          administrador_nombre?: string
          certificado_at?: string
          certificado_por?: string
          contador_nombre?: string | null
          contador_tarjeta_profesional?: string | null
          contador_tercero_id?: string | null
          documento_id?: string | null
          ejercicio?: number
          estados_incluidos?: string[]
          fecha_corte?: string
          hash_contenido?: string
          id?: string
          invalidada?: boolean
          invalidada_at?: string | null
          invalidada_motivo?: string | null
          tenant_id?: string
          texto_certificacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_certificacion_certificado_por_fkey"
            columns: ["certificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_certificacion_contador_tercero_id_fkey"
            columns: ["contador_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_certificacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_certificacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_certificacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_certificacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_codigo_retirado: {
        Row: {
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          motivo: string
          plan_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          motivo: string
          plan_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          fundamento_normativo_id?: number | null
          motivo?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_codigo_retirado_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_codigo_retirado_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "contable_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_comprobante: {
        Row: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          contabilizado_at: string | null
          creado_por: string | null
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["contable_comprobante_estado_t"]
          fecha: string
          id: string
          numero: number | null
          origen_entidad: string | null
          origen_evento: string | null
          origen_id: string | null
          origen_modulo: string | null
          periodo_id: string
          reversa_comprobante_id: string | null
          reversado_por_id: string | null
          tenant_id: string
          tipo_id: number
        }
        Insert: {
          anio: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          contabilizado_at?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion: string
          estado?: Database["public"]["Enums"]["contable_comprobante_estado_t"]
          fecha: string
          id?: string
          numero?: number | null
          origen_entidad?: string | null
          origen_evento?: string | null
          origen_id?: string | null
          origen_modulo?: string | null
          periodo_id: string
          reversa_comprobante_id?: string | null
          reversado_por_id?: string | null
          tenant_id: string
          tipo_id: number
        }
        Update: {
          anio?: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          contabilizado_at?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion?: string
          estado?: Database["public"]["Enums"]["contable_comprobante_estado_t"]
          fecha?: string
          id?: string
          numero?: number | null
          origen_entidad?: string | null
          origen_evento?: string | null
          origen_id?: string | null
          origen_modulo?: string | null
          periodo_id?: string
          reversa_comprobante_id?: string | null
          reversado_por_id?: string | null
          tenant_id?: string
          tipo_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contable_comprobante_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_reversa_comprobante_id_fkey"
            columns: ["reversa_comprobante_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_reversado_por_id_fkey"
            columns: ["reversado_por_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_comprobante_detalle: {
        Row: {
          agrupacion_id: string | null
          centro_costo_id: number | null
          comprobante_id: string
          credito: number
          cuenta_id: string
          debito: number
          descripcion: string | null
          fondo_id: string | null
          id: string
          inmueble_id: string | null
          linea: number
          origen_entidad: string | null
          origen_id: string | null
          presupuesto_cuenta_id: string | null
          tenant_id: string
          tercero_id: string | null
        }
        Insert: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          comprobante_id: string
          credito?: number
          cuenta_id: string
          debito?: number
          descripcion?: string | null
          fondo_id?: string | null
          id?: string
          inmueble_id?: string | null
          linea: number
          origen_entidad?: string | null
          origen_id?: string | null
          presupuesto_cuenta_id?: string | null
          tenant_id: string
          tercero_id?: string | null
        }
        Update: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          comprobante_id?: string
          credito?: number
          cuenta_id?: string
          debito?: number
          descripcion?: string | null
          fondo_id?: string | null
          id?: string
          inmueble_id?: string | null
          linea?: number
          origen_entidad?: string | null
          origen_id?: string | null
          presupuesto_cuenta_id?: string | null
          tenant_id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_comprobante_detalle_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_comprobante_detalle_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          tipo_id: number
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          tipo_id: number
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          tipo_id?: number
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_consecutivo_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_correccion: {
        Row: {
          comprobante_correcto_id: string
          comprobante_origen_id: string
          comprobante_reversion_id: string | null
          creado_por: string | null
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          motivo: string
          tenant_id: string
          tipo_correccion: string
        }
        Insert: {
          comprobante_correcto_id: string
          comprobante_origen_id: string
          comprobante_reversion_id?: string | null
          creado_por?: string | null
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          motivo: string
          tenant_id: string
          tipo_correccion: string
        }
        Update: {
          comprobante_correcto_id?: string
          comprobante_origen_id?: string
          comprobante_reversion_id?: string | null
          creado_por?: string | null
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          motivo?: string
          tenant_id?: string
          tipo_correccion?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_correccion_comprobante_correcto_id_fkey"
            columns: ["comprobante_correcto_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_comprobante_origen_id_fkey"
            columns: ["comprobante_origen_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_comprobante_reversion_id_fkey"
            columns: ["comprobante_reversion_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_correccion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_cuenta: {
        Row: {
          activa: boolean
          clase: number
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          naturaleza_tributaria_id: number | null
          nivel: number
          nombre: string
          parent_id: string | null
          permite_movimiento: boolean
          plan_cuenta_id: string | null
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          clase?: number
          codigo: string
          created_at?: string
          id?: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          naturaleza_tributaria_id?: number | null
          nivel?: number
          nombre: string
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_cuenta_id?: string | null
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          clase?: number
          codigo?: string
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["contable_naturaleza_t"]
          naturaleza_tributaria_id?: number | null
          nivel?: number
          nombre?: string
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_cuenta_id?: string | null
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_cuenta_naturaleza_tributaria_id_fkey"
            columns: ["naturaleza_tributaria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_plan_cuenta_id_fkey"
            columns: ["plan_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_plan_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_cuenta_default: {
        Row: {
          contable_cuenta_id: string
          created_at: string
          evento_id: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          contable_cuenta_id: string
          created_at?: string
          evento_id: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          contable_cuenta_id?: string
          created_at?: string
          evento_id?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_cuenta_default_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_cuenta_default_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_deterioro_detalle: {
        Row: {
          ajuste: number
          comprobante_id: string
          created_at: string
          cuenta_cartera_id: string
          deterioro_calculado: number
          deterioro_reconocido_previo: number
          id: string
          inmueble_id: string
          saldo: number
          tenant_id: string
        }
        Insert: {
          ajuste: number
          comprobante_id: string
          created_at?: string
          cuenta_cartera_id: string
          deterioro_calculado: number
          deterioro_reconocido_previo?: number
          id?: string
          inmueble_id: string
          saldo: number
          tenant_id: string
        }
        Update: {
          ajuste?: number
          comprobante_id?: string
          created_at?: string
          cuenta_cartera_id?: string
          deterioro_calculado?: number
          deterioro_reconocido_previo?: number
          id?: string
          inmueble_id?: string
          saldo?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_deterioro_detalle_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_deterioro_detalle_cuenta_cartera_id_fkey"
            columns: ["cuenta_cartera_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_deterioro_detalle_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_deterioro_detalle_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_deterioro_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_deterioro_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_dictamen: {
        Row: {
          certificacion_id: string
          created_at: string
          documento_id: string | null
          fecha: string
          id: string
          registrado_por: string | null
          revisor_fiscal_tercero_id: string
          tenant_id: string
          texto: string
          tipo_opinion_id: number
        }
        Insert: {
          certificacion_id: string
          created_at?: string
          documento_id?: string | null
          fecha: string
          id?: string
          registrado_por?: string | null
          revisor_fiscal_tercero_id: string
          tenant_id: string
          texto: string
          tipo_opinion_id: number
        }
        Update: {
          certificacion_id?: string
          created_at?: string
          documento_id?: string | null
          fecha?: string
          id?: string
          registrado_por?: string | null
          revisor_fiscal_tercero_id?: string
          tenant_id?: string
          texto?: string
          tipo_opinion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contable_dictamen_certificacion_id_fkey"
            columns: ["certificacion_id"]
            isOneToOne: false
            referencedRelation: "contable_certificacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_revisor_fiscal_tercero_id_fkey"
            columns: ["revisor_fiscal_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_dictamen_tipo_opinion_id_fkey"
            columns: ["tipo_opinion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_estado_linea: {
        Row: {
          codigo: string
          etiqueta: string
          formula: string | null
          fundamento_normativo_id: number | null
          id: string
          momento: string | null
          nivel: number
          nota_referencia: number | null
          orden: number
          plantilla_id: string
          selector_cuentas: string | null
          signo: number
          tipo_linea: Database["public"]["Enums"]["estado_linea_tipo_t"]
        }
        Insert: {
          codigo: string
          etiqueta: string
          formula?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          momento?: string | null
          nivel: number
          nota_referencia?: number | null
          orden: number
          plantilla_id: string
          selector_cuentas?: string | null
          signo?: number
          tipo_linea: Database["public"]["Enums"]["estado_linea_tipo_t"]
        }
        Update: {
          codigo?: string
          etiqueta?: string
          formula?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          momento?: string | null
          nivel?: number
          nota_referencia?: number | null
          orden?: number
          plantilla_id?: string
          selector_cuentas?: string | null
          signo?: number
          tipo_linea?: Database["public"]["Enums"]["estado_linea_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "contable_estado_linea_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_estado_linea_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "contable_estado_plantilla"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_estado_plantilla: {
        Row: {
          codigo: string
          created_at: string
          id: string
          marco_grupo: Database["public"]["Enums"]["marco_contable_grupo_t"]
          modo_valor: string
          nombre: string
          version: number
          vigente: boolean
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          marco_grupo: Database["public"]["Enums"]["marco_contable_grupo_t"]
          modo_valor: string
          nombre: string
          version?: number
          vigente?: boolean
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          marco_grupo?: Database["public"]["Enums"]["marco_contable_grupo_t"]
          modo_valor?: string
          nombre?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      contable_nota: {
        Row: {
          cuerpo: string
          editada_at: string | null
          editada_por: string | null
          ejercicio: number
          estado: string
          generada_at: string
          id: string
          numero: number
          plantilla_id: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          cuerpo: string
          editada_at?: string | null
          editada_por?: string | null
          ejercicio: number
          estado?: string
          generada_at?: string
          id?: string
          numero: number
          plantilla_id: string
          tenant_id: string
          titulo: string
        }
        Update: {
          cuerpo?: string
          editada_at?: string | null
          editada_por?: string | null
          ejercicio?: number
          estado?: string
          generada_at?: string
          id?: string
          numero?: number
          plantilla_id?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_nota_editada_por_fkey"
            columns: ["editada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_nota_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "contable_nota_plantilla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_nota_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_nota_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_nota_plantilla: {
        Row: {
          codigo: string
          created_at: string
          cuerpo_plantilla: string
          fundamento_normativo_id: number | null
          id: string
          marco_grupo:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          numero: number
          obligatoria: boolean
          orden: number
          titulo: string
        }
        Insert: {
          codigo: string
          created_at?: string
          cuerpo_plantilla: string
          fundamento_normativo_id?: number | null
          id?: string
          marco_grupo?:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          numero: number
          obligatoria?: boolean
          orden: number
          titulo: string
        }
        Update: {
          codigo?: string
          created_at?: string
          cuerpo_plantilla?: string
          fundamento_normativo_id?: number | null
          id?: string
          marco_grupo?:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          numero?: number
          obligatoria?: boolean
          orden?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_nota_plantilla_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_plan: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          version: number
          vigente: boolean
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          version?: number
          vigente?: boolean
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          version?: number
          vigente?: boolean
        }
        Relationships: []
      }
      contable_plan_cuenta: {
        Row: {
          clase: number
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel: number
          nombre: string
          opcional: boolean
          parent_id: string | null
          permite_movimiento: boolean
          plan_id: string
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
        }
        Insert: {
          clase?: number
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre: string
          opcional?: boolean
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_id: string
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
        }
        Update: {
          clase?: number
          codigo?: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          naturaleza?: Database["public"]["Enums"]["contable_naturaleza_t"]
          nivel?: number
          nombre?: string
          opcional?: boolean
          parent_id?: string | null
          permite_movimiento?: boolean
          plan_id?: string
          requiere_centro_costo?: boolean
          requiere_fondo?: boolean
          requiere_inmueble?: boolean
          requiere_tercero?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contable_plan_cuenta_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_plan_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contable_plan_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_plan_cuenta_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "contable_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_politica_conservacion: {
        Row: {
          actualizado_por: string | null
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          plazo_anios: number
          tenant_id: string
          tipo_documento_id: number
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          plazo_anios: number
          tenant_id: string
          tipo_documento_id: number
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          plazo_anios?: number
          tenant_id?: string
          tipo_documento_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_politica_conservacion_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_conservacion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_conservacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_conservacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_conservacion_tipo_documento_id_fkey"
            columns: ["tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_politica_deterioro: {
        Row: {
          acta_referencia: string | null
          aprobada_at: string | null
          aprobada_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          excluir_cargos_con_acuerdo_vigente: boolean
          fundamento: string | null
          id: string
          metodo: Database["public"]["Enums"]["deterioro_metodo_t"]
          porcentaje_global: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_referencia?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          excluir_cargos_con_acuerdo_vigente?: boolean
          fundamento?: string | null
          id?: string
          metodo: Database["public"]["Enums"]["deterioro_metodo_t"]
          porcentaje_global?: number | null
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_referencia?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          excluir_cargos_con_acuerdo_vigente?: boolean
          fundamento?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["deterioro_metodo_t"]
          porcentaje_global?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contable_politica_deterioro_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_deterioro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_deterioro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_politica_deterioro_tramo: {
        Row: {
          created_at: string
          dias_desde: number
          dias_hasta: number | null
          id: string
          politica_id: string
          porcentaje: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          dias_desde: number
          dias_hasta?: number | null
          id?: string
          politica_id: string
          porcentaje: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          dias_desde?: number
          dias_hasta?: number | null
          id?: string
          politica_id?: string
          porcentaje?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_politica_deterioro_tramo_politica_id_fkey"
            columns: ["politica_id"]
            isOneToOne: false
            referencedRelation: "contable_politica_deterioro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_deterioro_tramo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_politica_deterioro_tramo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contable_rendicion_cuentas: {
        Row: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acta_referencia_texto?: string | null
          aprobada_at?: string | null
          certificacion_id: string
          creado_por?: string | null
          created_at?: string
          decision_id?: string | null
          dictamen_id?: string | null
          documento_id?: string | null
          ejercicio: number
          estado?: string
          id?: string
          libros_dian_fecha?: string | null
          libros_dian_radicado?: string | null
          libros_dian_registrado?: boolean
          observaciones?: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at?: string | null
          presupuesto_ejecutado_resumen?: Json | null
          reunion_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acta_referencia_texto?: string | null
          aprobada_at?: string | null
          certificacion_id?: string
          creado_por?: string | null
          created_at?: string
          decision_id?: string | null
          dictamen_id?: string | null
          documento_id?: string | null
          ejercicio?: number
          estado?: string
          id?: string
          libros_dian_fecha?: string | null
          libros_dian_radicado?: string | null
          libros_dian_registrado?: boolean
          observaciones?: string | null
          periodo_desde?: string
          periodo_hasta?: string
          presentada_at?: string | null
          presupuesto_ejecutado_resumen?: Json | null
          reunion_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contable_rendicion_cuentas_certificacion_id_fkey"
            columns: ["certificacion_id"]
            isOneToOne: false
            referencedRelation: "contable_certificacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_dictamen_id_fkey"
            columns: ["dictamen_id"]
            isOneToOne: false
            referencedRelation: "contable_dictamen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contable_rendicion_cuentas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      costas_judiciales: {
        Row: {
          actuacion_id: string | null
          autoridad: string
          caso_id: string
          created_at: string
          documento_fuente: string
          estado: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision: string
          id: string
          monto: number
          monto_recuperado: number
          registrada_por: string | null
          tenant_id: string
          tipo_costa: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Insert: {
          actuacion_id?: string | null
          autoridad: string
          caso_id: string
          created_at?: string
          documento_fuente: string
          estado?: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision: string
          id?: string
          monto: number
          monto_recuperado?: number
          registrada_por?: string | null
          tenant_id: string
          tipo_costa: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Update: {
          actuacion_id?: string | null
          autoridad?: string
          caso_id?: string
          created_at?: string
          documento_fuente?: string
          estado?: Database["public"]["Enums"]["estado_costa_t"]
          fecha_decision?: string
          id?: string
          monto?: number
          monto_recuperado?: number
          registrada_por?: string | null
          tenant_id?: string
          tipo_costa?: Database["public"]["Enums"]["tipo_costa_t"]
        }
        Relationships: [
          {
            foreignKeyName: "costas_judiciales_actuacion_id_fkey"
            columns: ["actuacion_id"]
            isOneToOne: false
            referencedRelation: "caso_juridico_actuaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costas_judiciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activa: boolean
          contable_cuenta_id: string | null
          created_at: string
          entidad_financiera_id: number
          es_recaudo: boolean
          id: string
          numero_cuenta: string
          tenant_id: string
          tipo_cuenta: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular: string | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          contable_cuenta_id?: string | null
          created_at?: string
          entidad_financiera_id: number
          es_recaudo?: boolean
          id?: string
          numero_cuenta: string
          tenant_id: string
          tipo_cuenta: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular?: string | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          contable_cuenta_id?: string | null
          created_at?: string
          entidad_financiera_id?: number
          es_recaudo?: boolean
          id?: string
          numero_cuenta?: string
          tenant_id?: string
          tipo_cuenta?: Database["public"]["Enums"]["cuenta_bancaria_tipo_t"]
          titular?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_entidad_financiera_id_fkey"
            columns: ["entidad_financiera_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          anuncio_id: string | null
          busqueda_tsv: unknown
          caso_juridico_id: string | null
          created_at: string
          descripcion: string | null
          envio_id: string | null
          fecha_vencimiento: string | null
          grupo_id: string
          id: string
          inmueble_id: string | null
          nombre_archivo: string
          pago_id: string | null
          storage_path: string
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string
          tipo_documento_id: number
          version: number
        }
        Insert: {
          anuncio_id?: string | null
          busqueda_tsv?: unknown
          caso_juridico_id?: string | null
          created_at?: string
          descripcion?: string | null
          envio_id?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo: string
          pago_id?: string | null
          storage_path: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id: string
          tipo_documento_id: number
          version?: number
        }
        Update: {
          anuncio_id?: string | null
          busqueda_tsv?: unknown
          caso_juridico_id?: string | null
          created_at?: string
          descripcion?: string | null
          envio_id?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo?: string
          pago_id?: string | null
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id?: string
          tipo_documento_id?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_caso_juridico_id_fkey"
            columns: ["caso_juridico_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tipo_documento_id_fkey"
            columns: ["tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_legal_holds: {
        Row: {
          activo: boolean
          actualizado_por: string | null
          caso_id: string | null
          creado_por: string
          created_at: string
          documento_grupo_id: string
          id: string
          motivo: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          actualizado_por?: string | null
          caso_id?: string | null
          creado_por: string
          created_at?: string
          documento_grupo_id: string
          id?: string
          motivo: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          actualizado_por?: string | null
          caso_id?: string | null
          creado_por?: string
          created_at?: string
          documento_grupo_id?: string
          id?: string
          motivo?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_legal_holds_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_legal_holds_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_legal_holds_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_legal_holds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_legal_holds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          brevo_template_id: number | null
          created_at: string
          event_type: string
          html_content: string
          id: string
          is_synced: boolean
          last_synced_at: string | null
          subject: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        Insert: {
          brevo_template_id?: number | null
          created_at?: string
          event_type: string
          html_content: string
          id?: string
          is_synced?: boolean
          last_synced_at?: string | null
          subject: string
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          brevo_template_id?: number | null
          created_at?: string
          event_type?: string
          html_content?: string
          id?: string
          is_synced?: boolean
          last_synced_at?: string | null
          subject?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estados_cuenta_generados: {
        Row: {
          created_at: string
          datos: Json
          folio: string | null
          generado_por: string | null
          id: string
          inmueble_id: string
          liquidacion_id: string | null
          periodo_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          datos: Json
          folio?: string | null
          generado_por?: string | null
          id?: string
          inmueble_id: string
          liquidacion_id?: string | null
          periodo_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          datos?: Json
          folio?: string | null
          generado_por?: string | null
          id?: string
          inmueble_id?: string
          liquidacion_id?: string | null
          periodo_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estados_cuenta_generados_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estados_cuenta_generados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estrategias_cobranza: {
        Row: {
          activa: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo: string
          created_at: string
          dias_desde_clasificacion: number
          frecuencia_dias: number | null
          id: string
          max_intentos: number
          monto_minimo_deuda: number | null
          nombre: string
          orden: number
          plantilla_codigo: string | null
          politica_id: string
          requiere_aprobacion: boolean
          rol_minimo: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id: string
        }
        Insert: {
          activa?: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo: string
          created_at?: string
          dias_desde_clasificacion?: number
          frecuencia_dias?: number | null
          id?: string
          max_intentos?: number
          monto_minimo_deuda?: number | null
          nombre: string
          orden: number
          plantilla_codigo?: string | null
          politica_id: string
          requiere_aprobacion?: boolean
          rol_minimo?: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id: string
        }
        Update: {
          activa?: boolean
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          codigo?: string
          created_at?: string
          dias_desde_clasificacion?: number
          frecuencia_dias?: number | null
          id?: string
          max_intentos?: number
          monto_minimo_deuda?: number | null
          nombre?: string
          orden?: number
          plantilla_codigo?: string | null
          politica_id?: string
          requiere_aprobacion?: boolean
          rol_minimo?: Database["public"]["Enums"]["tenant_role_t"]
          tenant_id?: string
          tipo_accion?: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          tramo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estrategias_cobranza_politica_id_fkey"
            columns: ["politica_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategias_cobranza_tramo_id_fkey"
            columns: ["tramo_id"]
            isOneToOne: false
            referencedRelation: "politica_clasificacion_tramos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_cartera: {
        Row: {
          actor_id: string | null
          created_at: string
          dedup_key: string | null
          ejecucion_id: string | null
          entidad_id: string | null
          entidad_tipo: string | null
          estado_anterior: Json | null
          estado_nuevo: Json | null
          fecha_corte: string
          id: string
          inmueble_id: string | null
          motivo: string
          ocurrido_at: string
          origen: Database["public"]["Enums"]["origen_evento_t"]
          politica_id: string | null
          politica_version: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedup_key?: string | null
          ejecucion_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          fecha_corte: string
          id?: string
          inmueble_id?: string | null
          motivo: string
          ocurrido_at?: string
          origen: Database["public"]["Enums"]["origen_evento_t"]
          politica_id?: string | null
          politica_version?: number | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedup_key?: string | null
          ejecucion_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          fecha_corte?: string
          id?: string
          inmueble_id?: string | null
          motivo?: string
          ocurrido_at?: string
          origen?: Database["public"]["Enums"]["origen_evento_t"]
          politica_id?: string | null
          politica_version?: number | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["tipo_evento_cartera_t"]
        }
        Relationships: [
          {
            foreignKeyName: "eventos_cartera_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      extracto_bancario: {
        Row: {
          created_at: string
          cuenta_bancaria_id: string | null
          hash_archivo: string
          id: string
          importado_por: string | null
          lineas_totales: number
          nombre_archivo: string
          origen: Database["public"]["Enums"]["extracto_origen_t"]
          periodo_desde: string | null
          periodo_hasta: string | null
          storage_path: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          cuenta_bancaria_id?: string | null
          hash_archivo: string
          id?: string
          importado_por?: string | null
          lineas_totales?: number
          nombre_archivo: string
          origen?: Database["public"]["Enums"]["extracto_origen_t"]
          periodo_desde?: string | null
          periodo_hasta?: string | null
          storage_path?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          cuenta_bancaria_id?: string | null
          hash_archivo?: string
          id?: string
          importado_por?: string | null
          lineas_totales?: number
          nombre_archivo?: string
          origen?: Database["public"]["Enums"]["extracto_origen_t"]
          periodo_desde?: string | null
          periodo_hasta?: string | null
          storage_path?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracto_bancario_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_bancario_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_bancario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_bancario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      extracto_linea: {
        Row: {
          created_at: string
          descartada_motivo: string | null
          descripcion_banco: string
          estado: Database["public"]["Enums"]["conciliacion_estado_t"]
          extracto_id: string
          fecha_movimiento: string
          hash_linea: string
          id: string
          monto: number
          pago_id: string | null
          referencia_banco: string | null
          resuelta_at: string | null
          resuelta_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          descartada_motivo?: string | null
          descripcion_banco: string
          estado?: Database["public"]["Enums"]["conciliacion_estado_t"]
          extracto_id: string
          fecha_movimiento: string
          hash_linea: string
          id?: string
          monto: number
          pago_id?: string | null
          referencia_banco?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          descartada_motivo?: string | null
          descripcion_banco?: string
          estado?: Database["public"]["Enums"]["conciliacion_estado_t"]
          extracto_id?: string
          fecha_movimiento?: string
          hash_linea?: string
          id?: string
          monto?: number
          pago_id?: string | null
          referencia_banco?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracto_linea_extracto_id_fkey"
            columns: ["extracto_id"]
            isOneToOne: false
            referencedRelation: "extracto_bancario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_linea_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_linea_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_linea_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracto_linea_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_alerta_emitida: {
        Row: {
          created_at: string
          detalle: Json
          fecha_emision: string
          id: string
          regla_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          detalle: Json
          fecha_emision: string
          id?: string
          regla_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          detalle?: Json
          fecha_emision?: string
          id?: string
          regla_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_alerta_emitida_regla_id_fkey"
            columns: ["regla_id"]
            isOneToOne: false
            referencedRelation: "finanzas_alerta_regla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_alerta_emitida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_alerta_emitida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_alerta_regla: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          nombre: string
          semanas_consecutivas: number | null
          tenant_id: string
          tipo_id: number
          umbral: number | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre: string
          semanas_consecutivas?: number | null
          tenant_id: string
          tipo_id: number
          umbral?: number | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          nombre?: string
          semanas_consecutivas?: number | null
          tenant_id?: string
          tipo_id?: number
          umbral?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_alerta_regla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_alerta_regla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_alerta_regla_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_cuenta_bancaria_compromiso: {
        Row: {
          created_at: string
          cuenta_bancaria_id: string
          estado: Database["public"]["Enums"]["compromiso_bancario_estado_t"]
          fecha_esperada_ejecucion: string | null
          id: string
          monto: number
          motivo_anulacion: string | null
          motivo_liberacion: string | null
          origen: Database["public"]["Enums"]["compromiso_bancario_origen_t"]
          origen_id: string | null
          registrado_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          cuenta_bancaria_id: string
          estado?: Database["public"]["Enums"]["compromiso_bancario_estado_t"]
          fecha_esperada_ejecucion?: string | null
          id?: string
          monto: number
          motivo_anulacion?: string | null
          motivo_liberacion?: string | null
          origen: Database["public"]["Enums"]["compromiso_bancario_origen_t"]
          origen_id?: string | null
          registrado_por?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          cuenta_bancaria_id?: string
          estado?: Database["public"]["Enums"]["compromiso_bancario_estado_t"]
          fecha_esperada_ejecucion?: string | null
          id?: string
          monto?: number
          motivo_anulacion?: string | null
          motivo_liberacion?: string | null
          origen?: Database["public"]["Enums"]["compromiso_bancario_origen_t"]
          origen_id?: string | null
          registrado_por?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_cuenta_bancaria_compromiso_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_cuenta_bancaria_compromiso_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_cuenta_bancaria_compromiso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_cuenta_bancaria_compromiso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_escenario_parametros: {
        Row: {
          created_at: string
          dias_adicionales_pago_proveedor: number
          escenario: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          pct_recaudo_esperado: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          dias_adicionales_pago_proveedor?: number
          escenario: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          pct_recaudo_esperado?: number | null
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          dias_adicionales_pago_proveedor?: number
          escenario?: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          pct_recaudo_esperado?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_escenario_parametros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_escenario_parametros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_factura_advertencia: {
        Row: {
          codigo: string
          created_at: string
          factura_id: string
          id: string
          mensaje: string
          tenant_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          factura_id: string
          id?: string
          mensaje: string
          tenant_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          factura_id?: string
          id?: string
          mensaje?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_factura_advertencia_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "finanzas_facturas_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_factura_advertencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_factura_advertencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_factura_retencion: {
        Row: {
          base: number
          concepto_id: number
          factura_id: string
          id: string
          registrada_at: string
          tarifa: number
          tenant_id: string
          valor: number
        }
        Insert: {
          base: number
          concepto_id: number
          factura_id: string
          id?: string
          registrada_at?: string
          tarifa: number
          tenant_id: string
          valor: number
        }
        Update: {
          base?: number
          concepto_id?: number
          factura_id?: string
          id?: string
          registrada_at?: string
          tarifa?: number
          tenant_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_factura_retencion_concepto_fk"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "tributario_concepto_retencion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_factura_retencion_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "finanzas_facturas_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_factura_retencion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_factura_retencion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_facturas_proveedor: {
        Row: {
          aprobada_at: string | null
          aprobada_por: string | null
          centro_costo_id: number | null
          concepto_gasto: string | null
          contrato_id: string | null
          creado_por: string | null
          created_at: string
          documento_soporte_id: string | null
          estado: Database["public"]["Enums"]["factura_estado_t"]
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          iva_descontable: number
          iva_generado: number
          motivo_disputa: string | null
          motivo_rechazo: string | null
          numero_documento: string
          observaciones: string | null
          presupuesto_cuenta_id: string | null
          presupuesto_ejecucion_id: string | null
          proveedor_id: string
          subtotal: number
          tenant_id: string
          total_bruto: number
          total_neto_pagar: number
          total_retenciones: number
          updated_at: string | null
        }
        Insert: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          centro_costo_id?: number | null
          concepto_gasto?: string | null
          contrato_id?: string | null
          creado_por?: string | null
          created_at?: string
          documento_soporte_id?: string | null
          estado?: Database["public"]["Enums"]["factura_estado_t"]
          fecha_emision: string
          fecha_vencimiento: string
          id?: string
          iva_descontable?: number
          iva_generado?: number
          motivo_disputa?: string | null
          motivo_rechazo?: string | null
          numero_documento: string
          observaciones?: string | null
          presupuesto_cuenta_id?: string | null
          presupuesto_ejecucion_id?: string | null
          proveedor_id: string
          subtotal: number
          tenant_id: string
          total_bruto: number
          total_neto_pagar: number
          total_retenciones?: number
          updated_at?: string | null
        }
        Update: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          centro_costo_id?: number | null
          concepto_gasto?: string | null
          contrato_id?: string | null
          creado_por?: string | null
          created_at?: string
          documento_soporte_id?: string | null
          estado?: Database["public"]["Enums"]["factura_estado_t"]
          fecha_emision?: string
          fecha_vencimiento?: string
          id?: string
          iva_descontable?: number
          iva_generado?: number
          motivo_disputa?: string | null
          motivo_rechazo?: string | null
          numero_documento?: string
          observaciones?: string | null
          presupuesto_cuenta_id?: string | null
          presupuesto_ejecucion_id?: string | null
          proveedor_id?: string
          subtotal?: number
          tenant_id?: string
          total_bruto?: number
          total_neto_pagar?: number
          total_retenciones?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_facturas_proveedor_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_documento_soporte_id_fkey"
            columns: ["documento_soporte_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_documento_soporte_id_fkey"
            columns: ["documento_soporte_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_presupuesto_ejecucion_id_fkey"
            columns: ["presupuesto_ejecucion_id"]
            isOneToOne: true
            referencedRelation: "presupuesto_ejecucion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_facturas_proveedor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_flujo_corridas_diarias: {
        Row: {
          disparado_at: string
          fecha_corte: string
          id: string
          origen: string
          tenant_id: string
        }
        Insert: {
          disparado_at?: string
          fecha_corte: string
          id?: string
          origen?: string
          tenant_id: string
        }
        Update: {
          disparado_at?: string
          fecha_corte?: string
          id?: string
          origen?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_flujo_corridas_diarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_flujo_corridas_diarias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_flujo_snapshot: {
        Row: {
          created_at: string
          escenario: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          fecha_calculo: string
          generado_por: string | null
          horizonte_dias: number
          id: string
          motivo: string
          parametros: Json
          resultado: Json
          saldo_inicial: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          escenario: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          fecha_calculo?: string
          generado_por?: string | null
          horizonte_dias: number
          id?: string
          motivo: string
          parametros: Json
          resultado: Json
          saldo_inicial: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          escenario?: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          fecha_calculo?: string
          generado_por?: string | null
          horizonte_dias?: number
          id?: string
          motivo?: string
          parametros?: Json
          resultado?: Json
          saldo_inicial?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_flujo_snapshot_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_flujo_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_flujo_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_lote_advertencia: {
        Row: {
          codigo: string
          created_at: string
          id: string
          lote_id: string
          mensaje: string
          tenant_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          lote_id: string
          mensaje: string
          tenant_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          lote_id?: string
          mensaje?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_lote_advertencia_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "finanzas_lotes_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_advertencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_advertencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_lote_items: {
        Row: {
          compromiso_bancario_id: string | null
          created_at: string
          es_pago_parcial: boolean
          factura_id: string
          id: string
          lote_id: string
          monto_a_pagar: number
          observaciones: string | null
          tenant_id: string
        }
        Insert: {
          compromiso_bancario_id?: string | null
          created_at?: string
          es_pago_parcial?: boolean
          factura_id: string
          id?: string
          lote_id: string
          monto_a_pagar: number
          observaciones?: string | null
          tenant_id: string
        }
        Update: {
          compromiso_bancario_id?: string | null
          created_at?: string
          es_pago_parcial?: boolean
          factura_id?: string
          id?: string
          lote_id?: string
          monto_a_pagar?: number
          observaciones?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_lote_items_compromiso_bancario_id_fkey"
            columns: ["compromiso_bancario_id"]
            isOneToOne: false
            referencedRelation: "finanzas_cuenta_bancaria_compromiso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "finanzas_facturas_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "finanzas_lotes_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_lotes_pago: {
        Row: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_pagos: number
          creado_por: string | null
          created_at: string
          cuenta_bancaria_id: string
          descripcion: string | null
          ejecutado_at: string | null
          ejecutado_por: string | null
          estado: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          fondo_id: string | null
          id: string
          justificacion: string | null
          monto_total: number
          numero: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          cantidad_pagos?: number
          creado_por?: string | null
          created_at?: string
          cuenta_bancaria_id: string
          descripcion?: string | null
          ejecutado_at?: string | null
          ejecutado_por?: string | null
          estado?: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada: string
          fondo_id?: string | null
          id?: string
          justificacion?: string | null
          monto_total?: number
          numero: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          cantidad_pagos?: number
          creado_por?: string | null
          created_at?: string
          cuenta_bancaria_id?: string
          descripcion?: string | null
          ejecutado_at?: string | null
          ejecutado_por?: string | null
          estado?: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id?: string | null
          fecha_ejecucion?: string | null
          fecha_programada?: string
          fondo_id?: string | null
          id?: string
          justificacion?: string | null
          monto_total?: number
          numero?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_lotes_pago_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_ejecutado_por_fkey"
            columns: ["ejecutado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_extracto_linea_id_fkey"
            columns: ["extracto_linea_id"]
            isOneToOne: false
            referencedRelation: "extracto_linea"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_lotes_pago_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_lotes_pago_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_lotes_pago_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_politica_aprobacion_lote: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          monto_umbral?: number | null
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          monto_umbral?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_politica_aprobacion_lote_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_politica_aprobacion_lote_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_politica_aprobacion_pago: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          monto_umbral?: number | null
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          monto_umbral?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_politica_aprobacion_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_politica_aprobacion_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finanzas_politica_tesoreria: {
        Row: {
          acta_referencia: string | null
          aprobada_at: string | null
          aprobada_por: string | null
          bancos_utilizables: string[]
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          fondos_utilizables: string[]
          id: string
          incluir_caja: boolean
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_referencia?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          bancos_utilizables?: string[]
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondos_utilizables?: string[]
          id?: string
          incluir_caja?: boolean
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_referencia?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          bancos_utilizables?: string[]
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondos_utilizables?: string[]
          id?: string
          incluir_caja?: boolean
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finanzas_politica_tesoreria_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_politica_tesoreria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finanzas_politica_tesoreria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_autorizaciones: {
        Row: {
          alcance: string | null
          created_at: string
          decision: string
          decision_id: string | null
          documento_id: string | null
          fecha_acta: string | null
          fondo_id: string
          id: string
          numero_acta: string | null
          organo_id: number
          registrada_por: string | null
          tenant_id: string
          tipo_decision: string
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          alcance?: string | null
          created_at?: string
          decision: string
          decision_id?: string | null
          documento_id?: string | null
          fecha_acta?: string | null
          fondo_id: string
          id?: string
          numero_acta?: string | null
          organo_id: number
          registrada_por?: string | null
          tenant_id: string
          tipo_decision: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          alcance?: string | null
          created_at?: string
          decision?: string
          decision_id?: string | null
          documento_id?: string | null
          fecha_acta?: string | null
          fondo_id?: string
          id?: string
          numero_acta?: string | null
          organo_id?: number
          registrada_por?: string | null
          tenant_id?: string
          tipo_decision?: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondo_autorizaciones_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_autorizaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_compromisos: {
        Row: {
          beneficiario_tercero_id: string | null
          concepto: string
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["fondo_compromiso_estado_t"]
          fecha: string
          fecha_limite: string | null
          fondo_id: string
          id: string
          monto: number
          monto_ejecutado: number
          registrado_por: string | null
          solicitud_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          beneficiario_tercero_id?: string | null
          concepto: string
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_compromiso_estado_t"]
          fecha?: string
          fecha_limite?: string | null
          fondo_id: string
          id?: string
          monto: number
          monto_ejecutado?: number
          registrado_por?: string | null
          solicitud_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          beneficiario_tercero_id?: string | null
          concepto?: string
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_compromiso_estado_t"]
          fecha?: string
          fecha_limite?: string | null
          fondo_id?: string
          id?: string
          monto?: number
          monto_ejecutado?: number
          registrado_por?: string | null
          solicitud_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondo_compromisos_beneficiario_tercero_id_fkey"
            columns: ["beneficiario_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "fondo_solicitudes_uso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_compromisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_fuentes: {
        Row: {
          activa: boolean
          autorizacion_id: string | null
          base_calculo: string | null
          created_at: string
          documento_id: string | null
          fondo_id: string
          id: string
          periodicidad: string | null
          porcentaje: number | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          valor: number | null
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          activa?: boolean
          autorizacion_id?: string | null
          base_calculo?: string | null
          created_at?: string
          documento_id?: string | null
          fondo_id: string
          id?: string
          periodicidad?: string | null
          porcentaje?: number | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          valor?: number | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          activa?: boolean
          autorizacion_id?: string | null
          base_calculo?: string | null
          created_at?: string
          documento_id?: string | null
          fondo_id?: string
          id?: string
          periodicidad?: string | null
          porcentaje?: number | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          valor?: number | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondo_fuentes_autorizacion_id_fkey"
            columns: ["autorizacion_id"]
            isOneToOne: false
            referencedRelation: "fondo_autorizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_fuentes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_movimientos: {
        Row: {
          autorizacion_id: string | null
          autorizado_por: string | null
          compromiso_id: string | null
          created_at: string
          descripcion: string | null
          documento_id: string | null
          extracto_linea_id: string | null
          fecha: string
          fondo_id: string
          id: string
          liquidacion_id: string | null
          monto: number
          motivo: string | null
          pago_id: string | null
          periodo_id: string | null
          registrado_por: string | null
          reversion_de_id: string | null
          solicitud_id: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Insert: {
          autorizacion_id?: string | null
          autorizado_por?: string | null
          compromiso_id?: string | null
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          extracto_linea_id?: string | null
          fecha?: string
          fondo_id: string
          id?: string
          liquidacion_id?: string | null
          monto: number
          motivo?: string | null
          pago_id?: string | null
          periodo_id?: string | null
          registrado_por?: string | null
          reversion_de_id?: string | null
          solicitud_id?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Update: {
          autorizacion_id?: string | null
          autorizado_por?: string | null
          compromiso_id?: string | null
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          extracto_linea_id?: string | null
          fecha?: string
          fondo_id?: string
          id?: string
          liquidacion_id?: string | null
          monto?: number
          motivo?: string | null
          pago_id?: string | null
          periodo_id?: string | null
          registrado_por?: string | null
          reversion_de_id?: string | null
          solicitud_id?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "fondo_movimientos_autorizacion_id_fkey"
            columns: ["autorizacion_id"]
            isOneToOne: false
            referencedRelation: "fondo_autorizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "fondo_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_extracto_linea_id_fkey"
            columns: ["extracto_linea_id"]
            isOneToOne: false
            referencedRelation: "extracto_linea"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_reversion_de_id_fkey"
            columns: ["reversion_de_id"]
            isOneToOne: false
            referencedRelation: "fondo_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "fondo_solicitudes_uso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_remanentes: {
        Row: {
          created_at: string
          decision: string
          destino: string
          documento_id: string | null
          fondo_destino_id: string | null
          fondo_id: string
          id: string
          monto: number
          movimiento_id: string
          organo_id: number
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          destino: string
          documento_id?: string | null
          fondo_destino_id?: string | null
          fondo_id: string
          id?: string
          monto: number
          movimiento_id: string
          organo_id: number
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          destino?: string
          documento_id?: string | null
          fondo_destino_id?: string | null
          fondo_id?: string
          id?: string
          monto?: number
          movimiento_id?: string
          organo_id?: number
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fondo_remanentes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_fondo_destino_id_fkey"
            columns: ["fondo_destino_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "fondo_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_remanentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondo_solicitudes_uso: {
        Row: {
          aprobador_id: string | null
          compromiso_id: string | null
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["fondo_solicitud_uso_estado_t"]
          fecha: string
          fecha_aprobacion: string | null
          fondo_id: string
          id: string
          justificacion: string | null
          monto_solicitado: number
          motivo_rechazo: string | null
          objetivo: string
          solicitante_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aprobador_id?: string | null
          compromiso_id?: string | null
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_solicitud_uso_estado_t"]
          fecha?: string
          fecha_aprobacion?: string | null
          fondo_id: string
          id?: string
          justificacion?: string | null
          monto_solicitado: number
          motivo_rechazo?: string | null
          objetivo: string
          solicitante_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          aprobador_id?: string | null
          compromiso_id?: string | null
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_solicitud_uso_estado_t"]
          fecha?: string
          fecha_aprobacion?: string | null
          fondo_id?: string
          id?: string
          justificacion?: string | null
          monto_solicitado?: number
          motivo_rechazo?: string | null
          objetivo?: string
          solicitante_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondo_solicitudes_uso_aprobador_id_fkey"
            columns: ["aprobador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "fondo_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondo_solicitudes_uso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fondos: {
        Row: {
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          destinacion: string | null
          documento_principal_id: string | null
          estado: Database["public"]["Enums"]["fondo_estado_t"]
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          meta: number | null
          naturaleza: Database["public"]["Enums"]["fondo_naturaleza_t"]
          nombre: string
          objetivo: string | null
          permanente: boolean
          saldo_actual: number
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          codigo: string
          contable_cuenta_id?: string | null
          created_at?: string
          destinacion?: string | null
          documento_principal_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_estado_t"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          meta?: number | null
          naturaleza: Database["public"]["Enums"]["fondo_naturaleza_t"]
          nombre: string
          objetivo?: string | null
          permanente?: boolean
          saldo_actual?: number
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          contable_cuenta_id?: string | null
          created_at?: string
          destinacion?: string | null
          documento_principal_id?: string | null
          estado?: Database["public"]["Enums"]["fondo_estado_t"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          meta?: number | null
          naturaleza?: Database["public"]["Enums"]["fondo_naturaleza_t"]
          nombre?: string
          objetivo?: string | null
          permanente?: boolean
          saldo_actual?: number
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fondos_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_documento_principal_id_fkey"
            columns: ["documento_principal_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_documento_principal_id_fkey"
            columns: ["documento_principal_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fondos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      fuente_financiacion: {
        Row: {
          created_at: string
          descripcion: string | null
          fondo_id: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_cuenta_id: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fondo_id?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_cuenta_id?: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible: number
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fondo_id?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_cuenta_id?: string | null
          presupuesto_id?: string
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuente_financiacion_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuente_financiacion_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamento_normativo: {
        Row: {
          aprobado_por: string | null
          articulo: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["fundamento_estado_t"]
          fecha_validacion: string | null
          fecha_vigencia: string | null
          fuente_url: string | null
          id: number
          norma: string
          propuesto_at: string | null
          propuesto_por: string | null
          rechazado_motivo: string | null
          referencia: string | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at: string | null
          validado_por: string | null
        }
        Insert: {
          aprobado_por?: string | null
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["fundamento_estado_t"]
          fecha_validacion?: string | null
          fecha_vigencia?: string | null
          fuente_url?: string | null
          id?: never
          norma: string
          propuesto_at?: string | null
          propuesto_por?: string | null
          rechazado_motivo?: string | null
          referencia?: string | null
          tenant_id?: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
          validado_por?: string | null
        }
        Update: {
          aprobado_por?: string | null
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["fundamento_estado_t"]
          fecha_validacion?: string | null
          fecha_vigencia?: string | null
          fuente_url?: string | null
          id?: never
          norma?: string
          propuesto_at?: string | null
          propuesto_por?: string | null
          rechazado_motivo?: string | null
          referencia?: string | null
          tenant_id?: string | null
          tipo?: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundamento_normativo_propuesto_por_fkey"
            columns: ["propuesto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_normativo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_normativo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamento_propuesta: {
        Row: {
          articulo: string | null
          creado_at: string
          creado_por: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["propuesta_estado_t"]
          fuente_url: string | null
          fundamento_original_id: number
          id: number
          norma: string
          rechazado_motivo: string | null
          referencia: string | null
          revisado_at: string | null
          revisado_por: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
        }
        Insert: {
          articulo?: string | null
          creado_at?: string
          creado_por: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["propuesta_estado_t"]
          fuente_url?: string | null
          fundamento_original_id: number
          id?: never
          norma: string
          rechazado_motivo?: string | null
          referencia?: string | null
          revisado_at?: string | null
          revisado_por?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
        }
        Update: {
          articulo?: string | null
          creado_at?: string
          creado_por?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["propuesta_estado_t"]
          fuente_url?: string | null
          fundamento_original_id?: number
          id?: never
          norma?: string
          rechazado_motivo?: string | null
          referencia?: string | null
          revisado_at?: string | null
          revisado_por?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fundamento_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "fundamento_propuesta_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_propuesta_fundamento_original_id_fkey"
            columns: ["fundamento_original_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_propuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamento_propuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_acta_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_acta_entregas: {
        Row: {
          acta_id: string
          created_at: string
          fecha: string
          id: string
          motivo_negativa: string | null
          observaciones: string | null
          solicitante_ref: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          acta_id: string
          created_at?: string
          fecha?: string
          id?: string
          motivo_negativa?: string | null
          observaciones?: string | null
          solicitante_ref?: string | null
          tenant_id: string
          tipo: string
        }
        Update: {
          acta_id?: string
          created_at?: string
          fecha?: string
          id?: string
          motivo_negativa?: string | null
          observaciones?: string | null
          solicitante_ref?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_entregas_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "gobierno_actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_entregas_solicitante_ref_fkey"
            columns: ["solicitante_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_entregas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_entregas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_acta_verificadores: {
        Row: {
          acta_id: string
          created_at: string
          designado_en_decision_id: string | null
          id: string
          observaciones: string | null
          plazo_limite: string
          tenant_id: string
          tercero_id: string
          updated_at: string | null
          verificado_at: string | null
        }
        Insert: {
          acta_id: string
          created_at?: string
          designado_en_decision_id?: string | null
          id?: string
          observaciones?: string | null
          plazo_limite: string
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
          verificado_at?: string | null
        }
        Update: {
          acta_id?: string
          created_at?: string
          designado_en_decision_id?: string | null
          id?: string
          observaciones?: string | null
          plazo_limite?: string
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
          verificado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_verificadores_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "gobierno_actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_verificadores_designado_en_decision_id_fkey"
            columns: ["designado_en_decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_verificadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_verificadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_verificadores_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_actas: {
        Row: {
          anio: number
          contenido_generado: Json
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido: string | null
          id: string
          incluye_voto_nominal: boolean
          narrativa: string | null
          numero: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at: string | null
          suscrita_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          contenido_generado: Json
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido?: string | null
          id?: string
          incluye_voto_nominal?: boolean
          narrativa?: string | null
          numero?: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at?: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at?: string | null
          suscrita_por?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          contenido_generado?: Json
          created_at?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido?: string | null
          id?: string
          incluye_voto_nominal?: boolean
          narrativa?: string | null
          numero?: number | null
          plazo_disposicion_limite?: string
          presidente_miembro_id?: string
          puesta_a_disposicion_at?: string | null
          reunion_id?: string
          secretario_miembro_id?: string
          suscrita_at?: string | null
          suscrita_por?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_actas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_presidente_miembro_id_fkey"
            columns: ["presidente_miembro_id"]
            isOneToOne: false
            referencedRelation: "gobierno_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: true
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_secretario_miembro_id_fkey"
            columns: ["secretario_miembro_id"]
            isOneToOne: false
            referencedRelation: "gobierno_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_suscrita_por_fkey"
            columns: ["suscrita_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_agenda_puntos: {
        Row: {
          atribucion_id: number | null
          created_at: string
          descripcion: string | null
          documento_id: string | null
          id: string
          orden: number
          requiere_decision: boolean
          reunion_id: string
          tenant_id: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          atribucion_id?: number | null
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          id?: string
          orden: number
          requiere_decision?: boolean
          reunion_id: string
          tenant_id: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          atribucion_id?: number | null
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          id?: string
          orden?: number
          requiere_decision?: boolean
          reunion_id?: string
          tenant_id?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_agenda_puntos_atribucion_id_fkey"
            columns: ["atribucion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_agenda_puntos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_agenda_puntos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_agenda_puntos_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_agenda_puntos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_agenda_puntos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_asistencia: {
        Row: {
          asistente_ref: string
          calidad: Database["public"]["Enums"]["asistencia_calidad_t"]
          coeficiente: number
          id: string
          ingreso_at: string
          inmueble_id: string | null
          modalidad_asistencia: string | null
          poder_id: string | null
          reunion_id: string
          salida_at: string | null
          tenant_id: string
        }
        Insert: {
          asistente_ref: string
          calidad: Database["public"]["Enums"]["asistencia_calidad_t"]
          coeficiente?: number
          id?: string
          ingreso_at?: string
          inmueble_id?: string | null
          modalidad_asistencia?: string | null
          poder_id?: string | null
          reunion_id: string
          salida_at?: string | null
          tenant_id: string
        }
        Update: {
          asistente_ref?: string
          calidad?: Database["public"]["Enums"]["asistencia_calidad_t"]
          coeficiente?: number
          id?: string
          ingreso_at?: string
          inmueble_id?: string | null
          modalidad_asistencia?: string | null
          poder_id?: string | null
          reunion_id?: string
          salida_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_asistencia_asistente_ref_fkey"
            columns: ["asistente_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_poder_id_fkey"
            columns: ["poder_id"]
            isOneToOne: false
            referencedRelation: "gobierno_poderes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_asistencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_atribucion: {
        Row: {
          atribucion_id: number
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          organo_id: string
          origen: Database["public"]["Enums"]["atribucion_origen_t"]
          reglamento_referencia: string | null
          tenant_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          atribucion_id: number
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          organo_id: string
          origen: Database["public"]["Enums"]["atribucion_origen_t"]
          reglamento_referencia?: string | null
          tenant_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          atribucion_id?: number
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          organo_id?: string
          origen?: Database["public"]["Enums"]["atribucion_origen_t"]
          reglamento_referencia?: string | null
          tenant_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_atribucion_atribucion_id_fkey"
            columns: ["atribucion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_atribucion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_atribucion_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "gobierno_organos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_atribucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_atribucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_clase_sancion: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string
          fundamento_normativo_id: number | null
          id: number
          nombre: string
          numeral_articulo: string
          requiere_monto: boolean
          tope_acumulado_multiplo: number | null
          tope_multiplo_expensas: number | null
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion: string
          fundamento_normativo_id?: number | null
          id?: never
          nombre: string
          numeral_articulo: string
          requiere_monto?: boolean
          tope_acumulado_multiplo?: number | null
          tope_multiplo_expensas?: number | null
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string
          fundamento_normativo_id?: number | null
          id?: never
          nombre?: string
          numeral_articulo?: string
          requiere_monto?: boolean
          tope_acumulado_multiplo?: number | null
          tope_multiplo_expensas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_clase_sancion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_compromiso_avances: {
        Row: {
          compromiso_id: string
          created_at: string
          descripcion: string
          documento_id: string | null
          fecha: string
          id: string
          porcentaje: number | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          compromiso_id: string
          created_at?: string
          descripcion: string
          documento_id?: string | null
          fecha: string
          id?: string
          porcentaje?: number | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          compromiso_id?: string
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          fecha?: string
          id?: string
          porcentaje?: number | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_compromiso_avances_compromiso_id_fkey"
            columns: ["compromiso_id"]
            isOneToOne: false
            referencedRelation: "gobierno_compromisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromiso_avances_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromiso_avances_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromiso_avances_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromiso_avances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromiso_avances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_compromisos: {
        Row: {
          bloqueado_motivo: string | null
          cancelado_motivo: string | null
          created_at: string
          cumplido_at: string | null
          decision_id: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["gobierno_compromiso_estado_t"]
          fecha_limite: string | null
          fondo_id: string | null
          id: string
          monto_estimado: number | null
          orden: number
          presupuesto_cuenta_id: string | null
          responsable_miembro_id: string | null
          responsable_tercero_id: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          bloqueado_motivo?: string | null
          cancelado_motivo?: string | null
          created_at?: string
          cumplido_at?: string | null
          decision_id: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["gobierno_compromiso_estado_t"]
          fecha_limite?: string | null
          fondo_id?: string | null
          id?: string
          monto_estimado?: number | null
          orden: number
          presupuesto_cuenta_id?: string | null
          responsable_miembro_id?: string | null
          responsable_tercero_id?: string | null
          tenant_id: string
          titulo: string
          updated_at?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          bloqueado_motivo?: string | null
          cancelado_motivo?: string | null
          created_at?: string
          cumplido_at?: string | null
          decision_id?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["gobierno_compromiso_estado_t"]
          fecha_limite?: string | null
          fondo_id?: string | null
          id?: string
          monto_estimado?: number | null
          orden?: number
          presupuesto_cuenta_id?: string | null
          responsable_miembro_id?: string | null
          responsable_tercero_id?: string | null
          tenant_id?: string
          titulo?: string
          updated_at?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_compromisos_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_fondo_id_fkey"
            columns: ["fondo_id"]
            isOneToOne: false
            referencedRelation: "fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_responsable_miembro_id_fkey"
            columns: ["responsable_miembro_id"]
            isOneToOne: false
            referencedRelation: "gobierno_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_responsable_tercero_id_fkey"
            columns: ["responsable_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_compromisos_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_config_expensa_necesaria: {
        Row: {
          concepto_id: string
          created_at: string
          tenant_id: string
        }
        Insert: {
          concepto_id: string
          created_at?: string
          tenant_id: string
        }
        Update: {
          concepto_id?: string
          created_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_config_expensa_necesaria_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_config_expensa_necesaria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_config_expensa_necesaria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_convocatoria_envios: {
        Row: {
          acuse_at: string | null
          canal: string
          convocatoria_id: string
          created_at: string
          destinatario_ref: string
          enviado_at: string | null
          evidencia_documento_id: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          acuse_at?: string | null
          canal: string
          convocatoria_id: string
          created_at?: string
          destinatario_ref: string
          enviado_at?: string | null
          evidencia_documento_id?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          acuse_at?: string | null
          canal?: string
          convocatoria_id?: string
          created_at?: string
          destinatario_ref?: string
          enviado_at?: string | null
          evidencia_documento_id?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_convocatoria_envios_convocatoria_id_fkey"
            columns: ["convocatoria_id"]
            isOneToOne: false
            referencedRelation: "gobierno_convocatorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatoria_envios_destinatario_ref_fkey"
            columns: ["destinatario_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatoria_envios_evidencia_documento_id_fkey"
            columns: ["evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatoria_envios_evidencia_documento_id_fkey"
            columns: ["evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatoria_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatoria_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_convocatorias: {
        Row: {
          created_at: string
          documento_id: string | null
          emitida_at: string
          emitida_por: string | null
          fecha_limite_respuesta: string | null
          id: string
          orden_del_dia_congelado: Json | null
          reunion_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          emitida_at?: string
          emitida_por?: string | null
          fecha_limite_respuesta?: string | null
          id?: string
          orden_del_dia_congelado?: Json | null
          reunion_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          emitida_at?: string
          emitida_por?: string | null
          fecha_limite_respuesta?: string | null
          id?: string
          orden_del_dia_congelado?: Json | null
          reunion_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_convocatorias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatorias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatorias_emitida_por_fkey"
            columns: ["emitida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatorias_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatorias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_convocatorias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_decision_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_decision_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decision_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_decisiones: {
        Row: {
          acta_id: string | null
          agenda_punto_id: string | null
          anio: number
          anulada_at: string | null
          anulada_motivo: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite: string | null
          fundamento: string | null
          id: string
          materia_id: number
          numero: number
          organo_id: string
          prioridad: string | null
          reunion_id: string
          revoca_decision_id: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          votacion_id: string
        }
        Insert: {
          acta_id?: string | null
          agenda_punto_id?: string | null
          anio: number
          anulada_at?: string | null
          anulada_motivo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite?: string | null
          fundamento?: string | null
          id?: string
          materia_id: number
          numero: number
          organo_id: string
          prioridad?: string | null
          reunion_id: string
          revoca_decision_id?: string | null
          tenant_id: string
          titulo: string
          updated_at?: string | null
          votacion_id: string
        }
        Update: {
          acta_id?: string | null
          agenda_punto_id?: string | null
          anio?: number
          anulada_at?: string | null
          anulada_motivo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite?: string | null
          fundamento?: string | null
          id?: string
          materia_id?: number
          numero?: number
          organo_id?: string
          prioridad?: string | null
          reunion_id?: string
          revoca_decision_id?: string | null
          tenant_id?: string
          titulo?: string
          updated_at?: string | null
          votacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_decisiones_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "gobierno_actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_agenda_punto_id_fkey"
            columns: ["agenda_punto_id"]
            isOneToOne: false
            referencedRelation: "gobierno_agenda_puntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "gobierno_materia_decision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "gobierno_organos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_revoca_decision_id_fkey"
            columns: ["revoca_decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_decisiones_votacion_id_fkey"
            columns: ["votacion_id"]
            isOneToOne: true
            referencedRelation: "gobierno_votaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_expediente_actuaciones: {
        Row: {
          created_at: string
          descripcion: string
          documento_id: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          expediente_id: string
          fecha: string
          fecha_limite: string | null
          id: string
          plazo_dias: number | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          documento_id?: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          expediente_id: string
          fecha: string
          fecha_limite?: string | null
          id?: string
          plazo_dias?: number | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          etapa?: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          expediente_id?: string
          fecha?: string
          fecha_limite?: string | null
          id?: string
          plazo_dias?: number | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_expediente_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_actuaciones_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "gobierno_expedientes_convivencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_actuaciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_expediente_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_expediente_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expediente_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_expedientes_convivencia: {
        Row: {
          anio: number
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          cerrado_at: string | null
          created_at: string
          descripcion_hechos: string
          estado_final: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          fecha_hechos: string
          id: string
          infraccion_id: string
          inmueble_id: string
          numero: number
          presunto_infractor_ref: string
          propietario_responsable_ref: string | null
          reportado_at: string
          reportado_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          cerrado_at?: string | null
          created_at?: string
          descripcion_hechos: string
          estado_final?: string | null
          etapa?: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          fecha_hechos: string
          id?: string
          infraccion_id: string
          inmueble_id: string
          numero: number
          presunto_infractor_ref: string
          propietario_responsable_ref?: string | null
          reportado_at?: string
          reportado_por?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          calidad?: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          cerrado_at?: string | null
          created_at?: string
          descripcion_hechos?: string
          estado_final?: string | null
          etapa?: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          fecha_hechos?: string
          id?: string
          infraccion_id?: string
          inmueble_id?: string
          numero?: number
          presunto_infractor_ref?: string
          propietario_responsable_ref?: string | null
          reportado_at?: string
          reportado_por?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_expedientes_convivenc_propietario_responsable_ref_fkey"
            columns: ["propietario_responsable_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_infraccion_id_fkey"
            columns: ["infraccion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_infracciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_presunto_infractor_ref_fkey"
            columns: ["presunto_infractor_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_reportado_por_fkey"
            columns: ["reportado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_expedientes_convivencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_impugnacion_actuaciones: {
        Row: {
          created_at: string
          descripcion: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          fecha: string
          id: string
          impugnacion_id: string
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          documento_id?: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          fecha: string
          id?: string
          impugnacion_id: string
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["impugnacion_estado_t"]
          fecha?: string
          id?: string
          impugnacion_id?: string
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_impugnacion_id_fkey"
            columns: ["impugnacion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_impugnaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_impugnacion_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_impugnacion_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnacion_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_impugnaciones: {
        Row: {
          anio: number
          calidad: string | null
          causal: string
          created_at: string
          decision_id: string | null
          documento_id: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          expediente_id: string | null
          fecha_notificacion_objeto: string
          fecha_presentacion: string
          fundamento: string | null
          id: string
          impugnante_ref: string
          instancia: string | null
          numero: number
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_fundamento_valido: boolean
          plazo_limite: string
          presentada_en_plazo: boolean
          presentada_por: string | null
          resolucion_documento_id: string | null
          resuelta_at: string | null
          resultado:
            | Database["public"]["Enums"]["impugnacion_resultado_t"]
            | null
          resultado_detalle: string | null
          suspende_efectos: boolean
          suspension_fundamento: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          calidad?: string | null
          causal: string
          created_at?: string
          decision_id?: string | null
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["impugnacion_estado_t"]
          expediente_id?: string | null
          fecha_notificacion_objeto: string
          fecha_presentacion: string
          fundamento?: string | null
          id?: string
          impugnante_ref: string
          instancia?: string | null
          numero: number
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_fundamento_valido?: boolean
          plazo_limite: string
          presentada_en_plazo: boolean
          presentada_por?: string | null
          resolucion_documento_id?: string | null
          resuelta_at?: string | null
          resultado?:
            | Database["public"]["Enums"]["impugnacion_resultado_t"]
            | null
          resultado_detalle?: string | null
          suspende_efectos?: boolean
          suspension_fundamento?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          calidad?: string | null
          causal?: string
          created_at?: string
          decision_id?: string | null
          documento_id?: string | null
          estado?: Database["public"]["Enums"]["impugnacion_estado_t"]
          expediente_id?: string | null
          fecha_notificacion_objeto?: string
          fecha_presentacion?: string
          fundamento?: string | null
          id?: string
          impugnante_ref?: string
          instancia?: string | null
          numero?: number
          objeto_tipo?: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_fundamento_valido?: boolean
          plazo_limite?: string
          presentada_en_plazo?: boolean
          presentada_por?: string | null
          resolucion_documento_id?: string | null
          resuelta_at?: string | null
          resultado?:
            | Database["public"]["Enums"]["impugnacion_resultado_t"]
            | null
          resultado_detalle?: string | null
          suspende_efectos?: boolean
          suspension_fundamento?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_impugnaciones_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "gobierno_expedientes_convivencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_impugnante_ref_fkey"
            columns: ["impugnante_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_presentada_por_fkey"
            columns: ["presentada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_resolucion_documento_id_fkey"
            columns: ["resolucion_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_resolucion_documento_id_fkey"
            columns: ["resolucion_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_impugnaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_infracciones: {
        Row: {
          clases_sancion_permitidas: string[]
          codigo: string
          created_at: string
          descripcion: string | null
          documento_id: string | null
          es_no_pecuniaria: boolean
          id: string
          nombre: string
          reglamento_referencia: string
          tenant_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          clases_sancion_permitidas?: string[]
          codigo: string
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          es_no_pecuniaria?: boolean
          id?: string
          nombre: string
          reglamento_referencia: string
          tenant_id: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          clases_sancion_permitidas?: string[]
          codigo?: string
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          es_no_pecuniaria?: boolean
          id?: string
          nombre?: string
          reglamento_referencia?: string
          tenant_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_infracciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_infracciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_infracciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_infracciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_materia_decision: {
        Row: {
          admite_no_presencial: boolean
          admite_segunda_convocatoria: boolean
          base_calculo: Database["public"]["Enums"]["base_calculo_t"]
          codigo: string
          created_at: string
          descripcion: string
          fundamento_normativo_id: number | null
          id: number
          mayoria_tipo: Database["public"]["Enums"]["mayoria_tipo_t"]
          nombre: string
          numeral_articulo: string | null
          organo_competente_atribucion_id: number | null
        }
        Insert: {
          admite_no_presencial?: boolean
          admite_segunda_convocatoria?: boolean
          base_calculo: Database["public"]["Enums"]["base_calculo_t"]
          codigo: string
          created_at?: string
          descripcion: string
          fundamento_normativo_id?: number | null
          id?: never
          mayoria_tipo: Database["public"]["Enums"]["mayoria_tipo_t"]
          nombre: string
          numeral_articulo?: string | null
          organo_competente_atribucion_id?: number | null
        }
        Update: {
          admite_no_presencial?: boolean
          admite_segunda_convocatoria?: boolean
          base_calculo?: Database["public"]["Enums"]["base_calculo_t"]
          codigo?: string
          created_at?: string
          descripcion?: string
          fundamento_normativo_id?: number | null
          id?: never
          mayoria_tipo?: Database["public"]["Enums"]["mayoria_tipo_t"]
          nombre?: string
          numeral_articulo?: string | null
          organo_competente_atribucion_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_materia_decision_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_materia_decision_organo_competente_atribucion_id_fkey"
            columns: ["organo_competente_atribucion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_miembros: {
        Row: {
          created_at: string
          decision_id: string | null
          desde: string
          documento_id: string | null
          hasta: string | null
          id: string
          inmueble_id: string | null
          organo_id: string
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          desde: string
          documento_id?: string | null
          hasta?: string | null
          id?: string
          inmueble_id?: string | null
          organo_id: string
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          desde?: string
          documento_id?: string | null
          hasta?: string | null
          id?: string
          inmueble_id?: string | null
          organo_id?: string
          rol_id?: number
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_miembros_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "gobierno_organos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_miembros_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_organos: {
        Row: {
          created_at: string
          documento_id: string | null
          id: string
          nombre: string | null
          reglamento_referencia: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          id?: string
          nombre?: string | null
          reglamento_referencia?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          id?: string
          nombre?: string | null
          reglamento_referencia?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_organos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_organos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_organos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_organos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_organos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_parametro_impugnacion: {
        Row: {
          created_at: string
          fundamento_normativo_id: number | null
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_dias: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          fundamento_normativo_id?: number | null
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_dias: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          fundamento_normativo_id?: number | null
          objeto_tipo?: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_dias?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_parametro_impugnacion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_parametro_impugnacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_parametro_impugnacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_poderes: {
        Row: {
          alcance: string | null
          apoderado_ref: string
          created_at: string
          documento_id: string | null
          id: string
          inmueble_id: string
          otorgante_ref: string
          rechazado_motivo: string | null
          reunion_id: string
          tenant_id: string
          updated_at: string | null
          validado_at: string | null
          validado_por: string | null
        }
        Insert: {
          alcance?: string | null
          apoderado_ref: string
          created_at?: string
          documento_id?: string | null
          id?: string
          inmueble_id: string
          otorgante_ref: string
          rechazado_motivo?: string | null
          reunion_id: string
          tenant_id: string
          updated_at?: string | null
          validado_at?: string | null
          validado_por?: string | null
        }
        Update: {
          alcance?: string | null
          apoderado_ref?: string
          created_at?: string
          documento_id?: string | null
          id?: string
          inmueble_id?: string
          otorgante_ref?: string
          rechazado_motivo?: string | null
          reunion_id?: string
          tenant_id?: string
          updated_at?: string | null
          validado_at?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_poderes_apoderado_ref_fkey"
            columns: ["apoderado_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_otorgante_ref_fkey"
            columns: ["otorgante_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_poderes_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_politica_semaforo: {
        Row: {
          created_at: string
          dias_proximo_vencer: number
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        Insert: {
          created_at?: string
          dias_proximo_vencer?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
        }
        Update: {
          created_at?: string
          dias_proximo_vencer?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_politica_semaforo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_politica_semaforo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_regla_mayoria: {
        Row: {
          created_at: string
          id: string
          materia_id: number
          mayoria_pct: number
          quorum_minimo_pct: number
          reglamento_referencia: string | null
          tenant_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          materia_id: number
          mayoria_pct: number
          quorum_minimo_pct: number
          reglamento_referencia?: string | null
          tenant_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          materia_id?: number
          mayoria_pct?: number
          quorum_minimo_pct?: number
          reglamento_referencia?: string | null
          tenant_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_regla_mayoria_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "gobierno_materia_decision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_regla_mayoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_regla_mayoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_reuniones: {
        Row: {
          cancelada_motivo: string | null
          cerrada_at: string | null
          coeficiente_set_id: string | null
          convocatoria_antecedente_id: string | null
          convocatoria_regimen: Database["public"]["Enums"]["reunion_convocatoria_t"]
          created_at: string
          estado: Database["public"]["Enums"]["reunion_estado_t"]
          fecha_hora: string
          id: string
          instalada_at: string | null
          lugar: string | null
          medio: string | null
          modalidad: Database["public"]["Enums"]["reunion_modalidad_t"]
          organo_id: string
          presidente_miembro_id: string | null
          secretario_miembro_id: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          cancelada_motivo?: string | null
          cerrada_at?: string | null
          coeficiente_set_id?: string | null
          convocatoria_antecedente_id?: string | null
          convocatoria_regimen: Database["public"]["Enums"]["reunion_convocatoria_t"]
          created_at?: string
          estado?: Database["public"]["Enums"]["reunion_estado_t"]
          fecha_hora: string
          id?: string
          instalada_at?: string | null
          lugar?: string | null
          medio?: string | null
          modalidad: Database["public"]["Enums"]["reunion_modalidad_t"]
          organo_id: string
          presidente_miembro_id?: string | null
          secretario_miembro_id?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          cancelada_motivo?: string | null
          cerrada_at?: string | null
          coeficiente_set_id?: string | null
          convocatoria_antecedente_id?: string | null
          convocatoria_regimen?: Database["public"]["Enums"]["reunion_convocatoria_t"]
          created_at?: string
          estado?: Database["public"]["Enums"]["reunion_estado_t"]
          fecha_hora?: string
          id?: string
          instalada_at?: string | null
          lugar?: string | null
          medio?: string | null
          modalidad?: Database["public"]["Enums"]["reunion_modalidad_t"]
          organo_id?: string
          presidente_miembro_id?: string | null
          secretario_miembro_id?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_reuniones_coeficiente_set_id_fkey"
            columns: ["coeficiente_set_id"]
            isOneToOne: false
            referencedRelation: "coeficiente_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_convocatoria_antecedente_id_fkey"
            columns: ["convocatoria_antecedente_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_organo_id_fkey"
            columns: ["organo_id"]
            isOneToOne: false
            referencedRelation: "gobierno_organos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_presidente_miembro_id_fkey"
            columns: ["presidente_miembro_id"]
            isOneToOne: false
            referencedRelation: "gobierno_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_secretario_miembro_id_fkey"
            columns: ["secretario_miembro_id"]
            isOneToOne: false
            referencedRelation: "gobierno_miembros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_reuniones_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_sanciones: {
        Row: {
          clase_sancion_id: number
          created_at: string
          decision_id: string
          expediente_id: string
          id: string
          impuesta_at: string
          monto: number | null
          novedad_id: string | null
          publicacion_evidencia_documento_id: string | null
          tenant_id: string
          vigente_desde: string | null
          vigente_hasta: string | null
          zona_comun_id: string | null
        }
        Insert: {
          clase_sancion_id: number
          created_at?: string
          decision_id: string
          expediente_id: string
          id?: string
          impuesta_at?: string
          monto?: number | null
          novedad_id?: string | null
          publicacion_evidencia_documento_id?: string | null
          tenant_id: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
          zona_comun_id?: string | null
        }
        Update: {
          clase_sancion_id?: number
          created_at?: string
          decision_id?: string
          expediente_id?: string
          id?: string
          impuesta_at?: string
          monto?: number | null
          novedad_id?: string | null
          publicacion_evidencia_documento_id?: string | null
          tenant_id?: string
          vigente_desde?: string | null
          vigente_hasta?: string | null
          zona_comun_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_sanciones_clase_sancion_id_fkey"
            columns: ["clase_sancion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_clase_sancion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "gobierno_expedientes_convivencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_publicacion_evidencia_documento_id_fkey"
            columns: ["publicacion_evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_publicacion_evidencia_documento_id_fkey"
            columns: ["publicacion_evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_sanciones_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_vencimiento_config: {
        Row: {
          activo: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          created_at: string
          destinatario_regla: string
          dias_anticipacion: number
          id: string
          tenant_id: string
          tipo_vencimiento: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          created_at?: string
          destinatario_regla?: string
          dias_anticipacion: number
          id?: string
          tenant_id: string
          tipo_vencimiento: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          canal?: Database["public"]["Enums"]["canal_cobranza_t"]
          created_at?: string
          destinatario_regla?: string
          dias_anticipacion?: number
          id?: string
          tenant_id?: string
          tipo_vencimiento?: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_vencimiento_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_vencimiento_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_vencimiento_corridas: {
        Row: {
          disparado_at: string
          fecha_corte: string
          id: string
          notificados: number
          origen: string
          tenant_id: string
        }
        Insert: {
          disparado_at?: string
          fecha_corte: string
          id?: string
          notificados?: number
          origen?: string
          tenant_id: string
        }
        Update: {
          disparado_at?: string
          fecha_corte?: string
          id?: string
          notificados?: number
          origen?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_vencimiento_corridas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_vencimiento_corridas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_vencimiento_notificaciones: {
        Row: {
          config_id: string
          created_at: string
          entidad_id: string
          envio_id: string | null
          fecha_deteccion: string
          id: string
          tenant_id: string
          tipo_vencimiento: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
        }
        Insert: {
          config_id: string
          created_at?: string
          entidad_id: string
          envio_id?: string | null
          fecha_deteccion?: string
          id?: string
          tenant_id: string
          tipo_vencimiento: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
        }
        Update: {
          config_id?: string
          created_at?: string
          entidad_id?: string
          envio_id?: string | null
          fecha_deteccion?: string
          id?: string
          tenant_id?: string
          tipo_vencimiento?: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_vencimiento_notificaciones_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "gobierno_vencimiento_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_vencimiento_notificaciones_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_vencimiento_notificaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_vencimiento_notificaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_votaciones: {
        Row: {
          abierta_at: string
          agenda_punto_id: string | null
          anulada_motivo: string | null
          cerrada_at: string | null
          coeficiente_abstencion: number | null
          coeficiente_contra: number | null
          coeficiente_favor: number | null
          coeficiente_representado: number | null
          coeficiente_total: number | null
          created_at: string
          estado: Database["public"]["Enums"]["votacion_estado_t"]
          id: string
          materia_id: number
          metodo: Database["public"]["Enums"]["votacion_metodo_t"]
          pregunta: string
          regla_aplicada: Json | null
          resultado: Database["public"]["Enums"]["votacion_resultado_t"] | null
          reunion_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          abierta_at?: string
          agenda_punto_id?: string | null
          anulada_motivo?: string | null
          cerrada_at?: string | null
          coeficiente_abstencion?: number | null
          coeficiente_contra?: number | null
          coeficiente_favor?: number | null
          coeficiente_representado?: number | null
          coeficiente_total?: number | null
          created_at?: string
          estado?: Database["public"]["Enums"]["votacion_estado_t"]
          id?: string
          materia_id: number
          metodo?: Database["public"]["Enums"]["votacion_metodo_t"]
          pregunta: string
          regla_aplicada?: Json | null
          resultado?: Database["public"]["Enums"]["votacion_resultado_t"] | null
          reunion_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          abierta_at?: string
          agenda_punto_id?: string | null
          anulada_motivo?: string | null
          cerrada_at?: string | null
          coeficiente_abstencion?: number | null
          coeficiente_contra?: number | null
          coeficiente_favor?: number | null
          coeficiente_representado?: number | null
          coeficiente_total?: number | null
          created_at?: string
          estado?: Database["public"]["Enums"]["votacion_estado_t"]
          id?: string
          materia_id?: number
          metodo?: Database["public"]["Enums"]["votacion_metodo_t"]
          pregunta?: string
          regla_aplicada?: Json | null
          resultado?: Database["public"]["Enums"]["votacion_resultado_t"] | null
          reunion_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_votaciones_agenda_punto_id_fkey"
            columns: ["agenda_punto_id"]
            isOneToOne: false
            referencedRelation: "gobierno_agenda_puntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votaciones_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "gobierno_materia_decision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votaciones_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_reuniones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_votos: {
        Row: {
          asistencia_id: string
          coeficiente: number
          emitido_at: string
          id: string
          opcion_texto: string | null
          sentido: Database["public"]["Enums"]["votacion_sentido_t"] | null
          tenant_id: string
          votacion_id: string
        }
        Insert: {
          asistencia_id: string
          coeficiente: number
          emitido_at?: string
          id?: string
          opcion_texto?: string | null
          sentido?: Database["public"]["Enums"]["votacion_sentido_t"] | null
          tenant_id: string
          votacion_id: string
        }
        Update: {
          asistencia_id?: string
          coeficiente?: number
          emitido_at?: string
          id?: string
          opcion_texto?: string | null
          sentido?: Database["public"]["Enums"]["votacion_sentido_t"] | null
          tenant_id?: string
          votacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_votos_asistencia_id_fkey"
            columns: ["asistencia_id"]
            isOneToOne: false
            referencedRelation: "gobierno_asistencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_votos_votacion_id_fkey"
            columns: ["votacion_id"]
            isOneToOne: false
            referencedRelation: "gobierno_votaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      inmueble_atributo_historico: {
        Row: {
          agrupacion_id: string | null
          created_at: string
          id: string
          inmueble_id: string
          tenant_id: string
          tipo_id: number
          uso_predio_id: number | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          agrupacion_id?: string | null
          created_at?: string
          id?: string
          inmueble_id: string
          tenant_id: string
          tipo_id: number
          uso_predio_id?: number | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          agrupacion_id?: string | null
          created_at?: string
          id?: string
          inmueble_id?: string
          tenant_id?: string
          tipo_id?: number
          uso_predio_id?: number | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inmueble_atributo_historico_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_atributo_historico_uso_predio_id_fkey"
            columns: ["uso_predio_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      inmueble_persona_rol: {
        Row: {
          created_at: string
          es_pagador: boolean
          id: string
          inmueble_id: string
          porcentaje: number | null
          recibe_notificaciones: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          es_pagador?: boolean
          id?: string
          inmueble_id: string
          porcentaje?: number | null
          recibe_notificaciones?: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          es_pagador?: boolean
          id?: string
          inmueble_id?: string
          porcentaje?: number | null
          recibe_notificaciones?: boolean
          rol_id?: number
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inmueble_persona_rol_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_persona_rol_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      inmueble_transferencias: {
        Row: {
          created_at: string
          descripcion: string
          deuda_a_la_fecha: number | null
          documento_id: string | null
          fecha_transferencia: string
          id: string
          inmueble_id: string
          propietario_anterior_id: string | null
          propietario_nuevo_id: string
          registrado_por: string
          tenant_id: string
          tipo_transferencia_id: number
        }
        Insert: {
          created_at?: string
          descripcion: string
          deuda_a_la_fecha?: number | null
          documento_id?: string | null
          fecha_transferencia: string
          id?: string
          inmueble_id: string
          propietario_anterior_id?: string | null
          propietario_nuevo_id: string
          registrado_por: string
          tenant_id: string
          tipo_transferencia_id: number
        }
        Update: {
          created_at?: string
          descripcion?: string
          deuda_a_la_fecha?: number | null
          documento_id?: string | null
          fecha_transferencia?: string
          id?: string
          inmueble_id?: string
          propietario_anterior_id?: string | null
          propietario_nuevo_id?: string
          registrado_por?: string
          tenant_id?: string
          tipo_transferencia_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "inmueble_transferencias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_propietario_anterior_id_fkey"
            columns: ["propietario_anterior_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_propietario_nuevo_id_fkey"
            columns: ["propietario_nuevo_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmueble_transferencias_tipo_transferencia_id_fkey"
            columns: ["tipo_transferencia_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      inmuebles: {
        Row: {
          activo_desde: string | null
          agrupacion_id: string | null
          area_comun: number | null
          area_privada: number | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id: number | null
          estado_legal_observaciones: string | null
          gravamen_tipo_id: number | null
          habitabilidad_id: number | null
          id: string
          inactivo_desde: string | null
          matricula_inmobiliaria: string | null
          referencia_catastral: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_predio_id: number | null
        }
        Insert: {
          activo_desde?: string | null
          agrupacion_id?: string | null
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          gravamen_tipo_id?: number | null
          habitabilidad_id?: number | null
          id?: string
          inactivo_desde?: string | null
          matricula_inmobiliaria?: string | null
          referencia_catastral?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_predio_id?: number | null
        }
        Update: {
          activo_desde?: string | null
          agrupacion_id?: string | null
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          gravamen_tipo_id?: number | null
          habitabilidad_id?: number | null
          id?: string
          inactivo_desde?: string | null
          matricula_inmobiliaria?: string | null
          referencia_catastral?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          uso_predio_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inmuebles_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_estado_legal_id_fkey"
            columns: ["estado_legal_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_gravamen_tipo_id_fkey"
            columns: ["gravamen_tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_habitabilidad_id_fkey"
            columns: ["habitabilidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_uso_predio_id_fkey"
            columns: ["uso_predio_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      intenciones_pago: {
        Row: {
          creada_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["intencion_pago_estado_t"]
          expira_at: string
          id: string
          inmueble_id: string
          metodo: string | null
          monto: number
          pago_id: string | null
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          referencia: string
          revision_motivo: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          creada_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["intencion_pago_estado_t"]
          expira_at: string
          id?: string
          inmueble_id: string
          metodo?: string | null
          monto: number
          pago_id?: string | null
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          referencia: string
          revision_motivo?: string | null
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          creada_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["intencion_pago_estado_t"]
          expira_at?: string
          id?: string
          inmueble_id?: string
          metodo?: string | null
          monto?: number
          pago_id?: string | null
          proveedor?: Database["public"]["Enums"]["pasarela_proveedor_t"]
          referencia?: string
          revision_motivo?: string | null
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intenciones_pago_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intenciones_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intenciones_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intenciones_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intenciones_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intenciones_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["invite_status_t"]
          tenant_id?: string
          token_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidacion_lineas: {
        Row: {
          concepto_id: string
          created_at: string
          id: string
          inmueble_id: string
          liquidacion_id: string
          monto: number
          tenant_id: string
        }
        Insert: {
          concepto_id: string
          created_at?: string
          id?: string
          inmueble_id: string
          liquidacion_id: string
          monto: number
          tenant_id: string
        }
        Update: {
          concepto_id?: string
          created_at?: string
          id?: string
          inmueble_id?: string
          liquidacion_id?: string
          monto?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidacion_lineas_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacion_lineas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones: {
        Row: {
          anulada_at: string | null
          anulada_por: string | null
          aplicada_at: string | null
          aprobada_at: string | null
          aprobada_por: string | null
          avisos_aceptados: Json | null
          created_at: string
          estado: Database["public"]["Enums"]["liquidacion_estado_t"]
          id: string
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          nota_solicitud: string | null
          periodo_id: string
          propuesta_at: string | null
          propuesta_por: string | null
          result_hash: string
          sello_datos: string | null
          simulada_at: string
          simulada_por: string | null
          snapshot: Json | null
          snapshot_hash: string | null
          tenant_id: string
          tenant_total: number
          updated_at: string | null
        }
        Insert: {
          anulada_at?: string | null
          anulada_por?: string | null
          aplicada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          avisos_aceptados?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nota_solicitud?: string | null
          periodo_id: string
          propuesta_at?: string | null
          propuesta_por?: string | null
          result_hash: string
          sello_datos?: string | null
          simulada_at?: string
          simulada_por?: string | null
          snapshot?: Json | null
          snapshot_hash?: string | null
          tenant_id: string
          tenant_total: number
          updated_at?: string | null
        }
        Update: {
          anulada_at?: string | null
          anulada_por?: string | null
          aplicada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          avisos_aceptados?: Json | null
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nota_solicitud?: string | null
          periodo_id?: string
          propuesta_at?: string | null
          propuesta_por?: string | null
          result_hash?: string
          sello_datos?: string | null
          simulada_at?: string
          simulada_por?: string | null
          snapshot?: Json | null
          snapshot_hash?: string | null
          tenant_id?: string
          tenant_total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_simulada_por_fkey"
            columns: ["simulada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_tipos: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          id: number
          nombre: string
          orden: number
          tenant_id: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre: string
          orden?: number
          tenant_id?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre?: string
          orden?: number
          tenant_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_tipos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_tipo_fkey"
            columns: ["tipo"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      lista_tipos_ocultos: {
        Row: {
          created_at: string
          lista_tipos_id: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          lista_tipos_id: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          lista_tipos_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_tipos_ocultos_lista_tipos_id_fkey"
            columns: ["lista_tipos_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_ocultos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_tipos_ocultos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_activo_criticidad: {
        Row: {
          activo_id: string
          criterio_id: string
          evaluado_at: string
          evaluado_por: string | null
          id: string
          puntaje: number
          tenant_id: string
          valor: string
        }
        Insert: {
          activo_id: string
          criterio_id: string
          evaluado_at?: string
          evaluado_por?: string | null
          id?: string
          puntaje?: number
          tenant_id: string
          valor: string
        }
        Update: {
          activo_id?: string
          criterio_id?: string
          evaluado_at?: string
          evaluado_por?: string | null
          id?: string
          puntaje?: number
          tenant_id?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_activo_criticidad_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_activo_criticidad_criterio_id_fkey"
            columns: ["criterio_id"]
            isOneToOne: false
            referencedRelation: "mant_criticidad_criterio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_activo_criticidad_evaluado_por_fkey"
            columns: ["evaluado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_activo_criticidad_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_activo_criticidad_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_almacenes: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          tenant_id: string
          updated_at: string | null
          zona_comun_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          tenant_id: string
          updated_at?: string | null
          zona_comun_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          tenant_id?: string
          updated_at?: string | null
          zona_comun_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_almacenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_almacenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_almacenes_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_atributo_definicion: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
          obligatorio: boolean
          opciones: string[] | null
          orden: number
          tenant_id: string
          tipo_activo_id: number
          tipo_dato: Database["public"]["Enums"]["atributo_tipo_dato_t"]
          unidad_id: number | null
          updated_at: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          obligatorio?: boolean
          opciones?: string[] | null
          orden?: number
          tenant_id: string
          tipo_activo_id: number
          tipo_dato: Database["public"]["Enums"]["atributo_tipo_dato_t"]
          unidad_id?: number | null
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          obligatorio?: boolean
          opciones?: string[] | null
          orden?: number
          tenant_id?: string
          tipo_activo_id?: number
          tipo_dato?: Database["public"]["Enums"]["atributo_tipo_dato_t"]
          unidad_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_atributo_definicion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_atributo_definicion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_atributo_definicion_tipo_activo_id_fkey"
            columns: ["tipo_activo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_atributo_definicion_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_autorizaciones_visita: {
        Row: {
          autorizado_por_origen: Database["public"]["Enums"]["autorizacion_origen_t"]
          autorizado_por_ref: string
          created_at: string
          estado: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista: string
          hora_desde: string | null
          hora_hasta: string | null
          id: string
          inmueble_id: string
          qr_expira_at: string | null
          qr_token: string | null
          tenant_id: string
          tipo_id: number | null
          vehiculo_placa: string | null
          vehiculo_placa_normalizada: string | null
          visitante_documento: string | null
          visitante_nombre: string
        }
        Insert: {
          autorizado_por_origen: Database["public"]["Enums"]["autorizacion_origen_t"]
          autorizado_por_ref: string
          created_at?: string
          estado?: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista: string
          hora_desde?: string | null
          hora_hasta?: string | null
          id?: string
          inmueble_id: string
          qr_expira_at?: string | null
          qr_token?: string | null
          tenant_id: string
          tipo_id?: number | null
          vehiculo_placa?: string | null
          vehiculo_placa_normalizada?: string | null
          visitante_documento?: string | null
          visitante_nombre: string
        }
        Update: {
          autorizado_por_origen?: Database["public"]["Enums"]["autorizacion_origen_t"]
          autorizado_por_ref?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista?: string
          hora_desde?: string | null
          hora_hasta?: string | null
          id?: string
          inmueble_id?: string
          qr_expira_at?: string | null
          qr_token?: string | null
          tenant_id?: string
          tipo_id?: number | null
          vehiculo_placa?: string | null
          vehiculo_placa_normalizada?: string | null
          visitante_documento?: string | null
          visitante_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_autorizaciones_visita_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_autorizaciones_visita_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_autorizaciones_visita_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_autorizaciones_visita_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_autorizaciones_visita_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_consecutivo: {
        Row: {
          anio: number
          serie_id: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          serie_id: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          serie_id?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_consecutivo_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_contrato_activos: {
        Row: {
          activo_id: string
          contrato_id: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          activo_id: string
          contrato_id: string
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          activo_id?: string
          contrato_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_contrato_activos_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_activos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_contrato_clausulas: {
        Row: {
          contrato_id: string
          created_at: string
          documento_id: string | null
          id: string
          orden: number
          tenant_id: string
          texto: string
          titulo: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          documento_id?: string | null
          id?: string
          orden?: number
          tenant_id: string
          texto: string
          titulo: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          documento_id?: string | null
          id?: string
          orden?: number
          tenant_id?: string
          texto?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_contrato_clausulas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_clausulas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_clausulas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_clausulas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contrato_clausulas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_contratos: {
        Row: {
          codigo: string
          contrato_anterior_id: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          documento_id: string | null
          duracion_meses: number | null
          estado: Database["public"]["Enums"]["contrato_estado_t"]
          fecha_fin: string | null
          fecha_inicio: string
          forma_pago: string | null
          id: string
          objeto: string
          periodicidad_id: number | null
          preaviso_dias: number | null
          presupuesto_cuenta_id: string | null
          renovacion_automatica: boolean
          sla_respuesta_horas: number | null
          sla_solucion_horas: number | null
          supervisor_ref: string | null
          tenant_id: string
          tercero_id: string
          tipo_id: number
          updated_at: string | null
          valor_periodico: number | null
          valor_total: number | null
        }
        Insert: {
          codigo: string
          contrato_anterior_id?: string | null
          created_at?: string
          decision_id?: string | null
          descripcion?: string | null
          documento_id?: string | null
          duracion_meses?: number | null
          estado?: Database["public"]["Enums"]["contrato_estado_t"]
          fecha_fin?: string | null
          fecha_inicio: string
          forma_pago?: string | null
          id?: string
          objeto: string
          periodicidad_id?: number | null
          preaviso_dias?: number | null
          presupuesto_cuenta_id?: string | null
          renovacion_automatica?: boolean
          sla_respuesta_horas?: number | null
          sla_solucion_horas?: number | null
          supervisor_ref?: string | null
          tenant_id: string
          tercero_id: string
          tipo_id: number
          updated_at?: string | null
          valor_periodico?: number | null
          valor_total?: number | null
        }
        Update: {
          codigo?: string
          contrato_anterior_id?: string | null
          created_at?: string
          decision_id?: string | null
          descripcion?: string | null
          documento_id?: string | null
          duracion_meses?: number | null
          estado?: Database["public"]["Enums"]["contrato_estado_t"]
          fecha_fin?: string | null
          fecha_inicio?: string
          forma_pago?: string | null
          id?: string
          objeto?: string
          periodicidad_id?: number | null
          preaviso_dias?: number | null
          presupuesto_cuenta_id?: string | null
          renovacion_automatica?: boolean
          sla_respuesta_horas?: number | null
          sla_solucion_horas?: number | null
          supervisor_ref?: string | null
          tenant_id?: string
          tercero_id?: string
          tipo_id?: number
          updated_at?: string | null
          valor_periodico?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_contratos_contrato_anterior_id_fkey"
            columns: ["contrato_anterior_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_periodicidad_id_fkey"
            columns: ["periodicidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_contratos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_criticidad_banda: {
        Row: {
          created_at: string
          etiqueta: string
          id: string
          orden: number
          puntaje_desde: number
          puntaje_hasta: number | null
          set_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          etiqueta: string
          id?: string
          orden?: number
          puntaje_desde: number
          puntaje_hasta?: number | null
          set_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          etiqueta?: string
          id?: string
          orden?: number
          puntaje_desde?: number
          puntaje_hasta?: number | null
          set_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_criticidad_banda_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "mant_criticidad_set"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_criticidad_banda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_criticidad_banda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_criticidad_criterio: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          escala: Json
          id: string
          nombre: string
          peso: number
          set_id: string
          tenant_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          escala: Json
          id?: string
          nombre: string
          peso: number
          set_id: string
          tenant_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          escala?: Json
          id?: string
          nombre?: string
          peso?: number
          set_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_criticidad_criterio_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "mant_criticidad_set"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_criticidad_criterio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_criticidad_criterio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_criticidad_set: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_criticidad_set_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_criticidad_set_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_cumplimiento: {
        Row: {
          acreditacion_referencia: string | null
          activo_id: string | null
          created_at: string
          ejecutado_por_tercero_id: string | null
          evidencia_referencia: string | null
          fecha_cumplimiento: string
          id: string
          registrado_por: string | null
          requisito_id: string
          resultado: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id: string
          vence_at: string | null
        }
        Insert: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          created_at?: string
          ejecutado_por_tercero_id?: string | null
          evidencia_referencia?: string | null
          fecha_cumplimiento: string
          id?: string
          registrado_por?: string | null
          requisito_id: string
          resultado?: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id: string
          vence_at?: string | null
        }
        Update: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          created_at?: string
          ejecutado_por_tercero_id?: string | null
          evidencia_referencia?: string | null
          fecha_cumplimiento?: string
          id?: string
          registrado_por?: string | null
          requisito_id?: string
          resultado?: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id?: string
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_cumplimiento_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_cumplimiento_ejecutado_por_tercero_id_fkey"
            columns: ["ejecutado_por_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_cumplimiento_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_cumplimiento_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "mant_requisito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_cumplimiento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_cumplimiento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_depreciacion_detalle: {
        Row: {
          activo_id: string
          acumulada_nueva: number
          acumulada_previa: number
          base_depreciable: number
          comprobante_id: string
          created_at: string
          cuota_periodo: number
          id: string
          meses_transcurridos: number
          periodo_id: string
          tenant_id: string
        }
        Insert: {
          activo_id: string
          acumulada_nueva: number
          acumulada_previa: number
          base_depreciable: number
          comprobante_id: string
          created_at?: string
          cuota_periodo: number
          id?: string
          meses_transcurridos: number
          periodo_id: string
          tenant_id: string
        }
        Update: {
          activo_id?: string
          acumulada_nueva?: number
          acumulada_previa?: number
          base_depreciable?: number
          comprobante_id?: string
          created_at?: string
          cuota_periodo?: number
          id?: string
          meses_transcurridos?: number
          periodo_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_depreciacion_detalle_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_depreciacion_detalle_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "contable_comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_depreciacion_detalle_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_depreciacion_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_depreciacion_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_escenario: {
        Row: {
          activo_id: string
          creado_at: string
          creado_por: string | null
          decision_id: string | null
          evaluado_at: string | null
          id: string
          nombre: string
          resultado: Json | null
          supuestos: Json
          tenant_id: string
          tipo: Database["public"]["Enums"]["escenario_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          activo_id: string
          creado_at?: string
          creado_por?: string | null
          decision_id?: string | null
          evaluado_at?: string | null
          id?: string
          nombre: string
          resultado?: Json | null
          supuestos?: Json
          tenant_id: string
          tipo: Database["public"]["Enums"]["escenario_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          activo_id?: string
          creado_at?: string
          creado_por?: string | null
          decision_id?: string | null
          evaluado_at?: string | null
          id?: string
          nombre?: string
          resultado?: Json | null
          supuestos?: Json
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["escenario_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_escenario_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_escenario_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_escenario_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_escenario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_escenario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_garantia_reclamaciones: {
        Row: {
          created_at: string
          descripcion: string
          documento_id: string | null
          fecha_reclamo: string
          fecha_resolucion: string | null
          garantia_id: string
          id: string
          registrado_por: string | null
          resultado_id: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          descripcion: string
          documento_id?: string | null
          fecha_reclamo?: string
          fecha_resolucion?: string | null
          garantia_id: string
          id?: string
          registrado_por?: string | null
          resultado_id?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          fecha_reclamo?: string
          fecha_resolucion?: string | null
          garantia_id?: string
          id?: string
          registrado_por?: string | null
          resultado_id?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_garantia_reclamaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_garantia_id_fkey"
            columns: ["garantia_id"]
            isOneToOne: false
            referencedRelation: "mant_garantias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_resultado_id_fkey"
            columns: ["resultado_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantia_reclamaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_garantias: {
        Row: {
          activo_id: string
          alcance: string | null
          contrato_id: string | null
          created_at: string
          documento_id: string | null
          exclusiones: string | null
          id: string
          origen: Database["public"]["Enums"]["garantia_origen_t"]
          tenant_id: string
          tercero_id: string | null
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activo_id: string
          alcance?: string | null
          contrato_id?: string | null
          created_at?: string
          documento_id?: string | null
          exclusiones?: string | null
          id?: string
          origen: Database["public"]["Enums"]["garantia_origen_t"]
          tenant_id: string
          tercero_id?: string | null
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          activo_id?: string
          alcance?: string | null
          contrato_id?: string | null
          created_at?: string
          documento_id?: string | null
          exclusiones?: string | null
          id?: string
          origen?: Database["public"]["Enums"]["garantia_origen_t"]
          tenant_id?: string
          tercero_id?: string | null
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_garantias_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_garantias_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_habilitacion_requerida: {
        Row: {
          bloqueante: boolean
          condicion_tipo: Database["public"]["Enums"]["mant_habilitacion_condicion_t"]
          condicion_valor: string | null
          created_at: string
          id: string
          tenant_id: string
          tipo_habilitacion_id: number
          updated_at: string | null
        }
        Insert: {
          bloqueante?: boolean
          condicion_tipo: Database["public"]["Enums"]["mant_habilitacion_condicion_t"]
          condicion_valor?: string | null
          created_at?: string
          id?: string
          tenant_id: string
          tipo_habilitacion_id: number
          updated_at?: string | null
        }
        Update: {
          bloqueante?: boolean
          condicion_tipo?: Database["public"]["Enums"]["mant_habilitacion_condicion_t"]
          condicion_valor?: string | null
          created_at?: string
          id?: string
          tenant_id?: string
          tipo_habilitacion_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_habilitacion_requerida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_habilitacion_requerida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_habilitacion_requerida_tipo_habilitacion_id_fkey"
            columns: ["tipo_habilitacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_hallazgo_actuaciones: {
        Row: {
          created_at: string
          descripcion: string
          estado_desde: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          estado_hasta: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          fecha: string
          hallazgo_id: string
          id: string
          registrada_por: string
          tenant_id: string
          tipo_actuacion_id: number
        }
        Insert: {
          created_at?: string
          descripcion: string
          estado_desde?: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          estado_hasta?: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          fecha?: string
          hallazgo_id: string
          id?: string
          registrada_por: string
          tenant_id: string
          tipo_actuacion_id: number
        }
        Update: {
          created_at?: string
          descripcion?: string
          estado_desde?: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          estado_hasta?: Database["public"]["Enums"]["hallazgo_estado_t"] | null
          fecha?: string
          hallazgo_id?: string
          id?: string
          registrada_por?: string
          tenant_id?: string
          tipo_actuacion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "mant_hallazgo_actuaciones_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "mant_hallazgos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgo_actuaciones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgo_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgo_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgo_actuaciones_tipo_actuacion_id_fkey"
            columns: ["tipo_actuacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_hallazgos: {
        Row: {
          aceptado_at: string | null
          aceptado_motivo: string | null
          aceptado_por: string | null
          cerrado_at: string | null
          cerrado_evidencia_documento_id: string | null
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string | null
          id: string
          inspeccion_id: string
          organo_aprobador_id: string | null
          ot_id: string | null
          severidad: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aceptado_at?: string | null
          aceptado_motivo?: string | null
          aceptado_por?: string | null
          cerrado_at?: string | null
          cerrado_evidencia_documento_id?: string | null
          created_at?: string
          descripcion: string
          estado?: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite?: string | null
          id?: string
          inspeccion_id: string
          organo_aprobador_id?: string | null
          ot_id?: string | null
          severidad: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          aceptado_at?: string | null
          aceptado_motivo?: string | null
          aceptado_por?: string | null
          cerrado_at?: string | null
          cerrado_evidencia_documento_id?: string | null
          created_at?: string
          descripcion?: string
          estado?: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite?: string | null
          id?: string
          inspeccion_id?: string
          organo_aprobador_id?: string | null
          ot_id?: string | null
          severidad?: Database["public"]["Enums"]["severidad_t"]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_hallazgos_aceptado_por_fkey"
            columns: ["aceptado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_cerrado_evidencia_documento_id_fkey"
            columns: ["cerrado_evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_cerrado_evidencia_documento_id_fkey"
            columns: ["cerrado_evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "mant_inspecciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_organo_aprobador_id_fkey"
            columns: ["organo_aprobador_id"]
            isOneToOne: false
            referencedRelation: "gobierno_organos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_hallazgos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_incidencia_actuaciones: {
        Row: {
          created_at: string
          descripcion: string
          id: string
          incidencia_id: string
          registrado_por: string | null
          tenant_id: string
          tipo_actuacion: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          id?: string
          incidencia_id: string
          registrado_por?: string | null
          tenant_id: string
          tipo_actuacion: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          id?: string
          incidencia_id?: string
          registrado_por?: string | null
          tenant_id?: string
          tipo_actuacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_incidencia_actuaciones_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "mant_incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencia_actuaciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencia_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencia_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_incidencias: {
        Row: {
          activo_id: string | null
          agrupacion_id: string | null
          anio: number
          created_at: string
          descartada_motivo: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["incidencia_estado_t"]
          id: string
          incidencia_padre_id: string | null
          numero: number
          orden_trabajo_id: string | null
          origen_id: number
          prioridad_id: number | null
          prioridad_sobrescrita_motivo: string | null
          prioridad_sugerida_id: number | null
          registrada_por: string | null
          reportada_at: string
          reportante_contacto: string | null
          reportante_inmueble_id: string | null
          reportante_ref: string | null
          severidad_id: number | null
          tenant_id: string
          tipo_id: number
          titulo: string
          updated_at: string | null
          zona_comun_id: string | null
        }
        Insert: {
          activo_id?: string | null
          agrupacion_id?: string | null
          anio?: number
          created_at?: string
          descartada_motivo?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado_t"]
          id?: string
          incidencia_padre_id?: string | null
          numero?: number
          orden_trabajo_id?: string | null
          origen_id: number
          prioridad_id?: number | null
          prioridad_sobrescrita_motivo?: string | null
          prioridad_sugerida_id?: number | null
          registrada_por?: string | null
          reportada_at?: string
          reportante_contacto?: string | null
          reportante_inmueble_id?: string | null
          reportante_ref?: string | null
          severidad_id?: number | null
          tenant_id: string
          tipo_id: number
          titulo: string
          updated_at?: string | null
          zona_comun_id?: string | null
        }
        Update: {
          activo_id?: string | null
          agrupacion_id?: string | null
          anio?: number
          created_at?: string
          descartada_motivo?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado_t"]
          id?: string
          incidencia_padre_id?: string | null
          numero?: number
          orden_trabajo_id?: string | null
          origen_id?: number
          prioridad_id?: number | null
          prioridad_sobrescrita_motivo?: string | null
          prioridad_sugerida_id?: number | null
          registrada_por?: string | null
          reportada_at?: string
          reportante_contacto?: string | null
          reportante_inmueble_id?: string | null
          reportante_ref?: string | null
          severidad_id?: number | null
          tenant_id?: string
          tipo_id?: number
          titulo?: string
          updated_at?: string | null
          zona_comun_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_incidencias_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_incidencia_padre_id_fkey"
            columns: ["incidencia_padre_id"]
            isOneToOne: false
            referencedRelation: "mant_incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_orden_trabajo_fk"
            columns: ["orden_trabajo_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_prioridad_sugerida_id_fkey"
            columns: ["prioridad_sugerida_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_reportante_inmueble_id_fkey"
            columns: ["reportante_inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_reportante_inmueble_id_fkey"
            columns: ["reportante_inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_severidad_id_fkey"
            columns: ["severidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_incidencias_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inspeccion_formato_items: {
        Row: {
          created_at: string
          formato_id: string
          id: string
          orden: number
          requiere_evidencia: boolean
          severidad_si_no_conforme: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          formato_id: string
          id?: string
          orden?: number
          requiere_evidencia?: boolean
          severidad_si_no_conforme: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          texto: string
        }
        Update: {
          created_at?: string
          formato_id?: string
          id?: string
          orden?: number
          requiere_evidencia?: boolean
          severidad_si_no_conforme?: Database["public"]["Enums"]["severidad_t"]
          tenant_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_inspeccion_formato_items_formato_id_fkey"
            columns: ["formato_id"]
            isOneToOne: false
            referencedRelation: "mant_inspeccion_formatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_formato_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_formato_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inspeccion_formatos: {
        Row: {
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          nombre: string
          requisito_id: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre: string
          requisito_id?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre?: string
          requisito_id?: string | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_inspeccion_formatos_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "mant_requisito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_formatos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_formatos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_formatos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inspeccion_respuestas: {
        Row: {
          created_at: string
          evidencia_documento_id: string | null
          id: string
          inspeccion_id: string
          item_id: string
          observacion: string | null
          tenant_id: string
          valor: Database["public"]["Enums"]["respuesta_valor_t"]
        }
        Insert: {
          created_at?: string
          evidencia_documento_id?: string | null
          id?: string
          inspeccion_id: string
          item_id: string
          observacion?: string | null
          tenant_id: string
          valor: Database["public"]["Enums"]["respuesta_valor_t"]
        }
        Update: {
          created_at?: string
          evidencia_documento_id?: string | null
          id?: string
          inspeccion_id?: string
          item_id?: string
          observacion?: string | null
          tenant_id?: string
          valor?: Database["public"]["Enums"]["respuesta_valor_t"]
        }
        Relationships: [
          {
            foreignKeyName: "mant_inspeccion_respuestas_evidencia_documento_id_fkey"
            columns: ["evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_respuestas_evidencia_documento_id_fkey"
            columns: ["evidencia_documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_respuestas_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "mant_inspecciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_respuestas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "mant_inspeccion_formato_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_respuestas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspeccion_respuestas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inspecciones: {
        Row: {
          acreditacion_referencia: string | null
          activo_id: string | null
          created_at: string
          cumplimiento_id: string | null
          fecha: string
          formato_id: string
          formato_version: number
          id: string
          registrada_por: string | null
          resultado: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          resultado_motivo: string | null
          resultado_sugerido: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id: string
          tercero_id: string | null
        }
        Insert: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          created_at?: string
          cumplimiento_id?: string | null
          fecha: string
          formato_id: string
          formato_version: number
          id?: string
          registrada_por?: string | null
          resultado: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          resultado_motivo?: string | null
          resultado_sugerido: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id: string
          tercero_id?: string | null
        }
        Update: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          created_at?: string
          cumplimiento_id?: string | null
          fecha?: string
          formato_id?: string
          formato_version?: number
          id?: string
          registrada_por?: string | null
          resultado?: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          resultado_motivo?: string | null
          resultado_sugerido?: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_inspecciones_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_cumplimiento_id_fkey"
            columns: ["cumplimiento_id"]
            isOneToOne: false
            referencedRelation: "mant_cumplimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_formato_id_fkey"
            columns: ["formato_id"]
            isOneToOne: false
            referencedRelation: "mant_inspeccion_formatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inspecciones_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inventario_alertas: {
        Row: {
          almacen_id: string
          generada_at: string
          id: string
          repuesto_id: string
          resuelta_at: string | null
          stock_actual: number
          tenant_id: string
          tipo_alerta: Database["public"]["Enums"]["inventario_alerta_tipo_t"]
        }
        Insert: {
          almacen_id: string
          generada_at?: string
          id?: string
          repuesto_id: string
          resuelta_at?: string | null
          stock_actual: number
          tenant_id: string
          tipo_alerta: Database["public"]["Enums"]["inventario_alerta_tipo_t"]
        }
        Update: {
          almacen_id?: string
          generada_at?: string
          id?: string
          repuesto_id?: string
          resuelta_at?: string | null
          stock_actual?: number
          tenant_id?: string
          tipo_alerta?: Database["public"]["Enums"]["inventario_alerta_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "mant_inventario_alertas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "mant_almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_alertas_repuesto_id_fkey"
            columns: ["repuesto_id"]
            isOneToOne: false
            referencedRelation: "mant_repuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_inventario_movimientos: {
        Row: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          direccion: number
          documento_id: string | null
          id: string
          motivo: string | null
          orden_trabajo_id: string | null
          presupuesto_ejecucion_id: string | null
          registrado_at: string
          registrado_por: string | null
          repuesto_id: string
          tenant_id: string
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id: string | null
        }
        Insert: {
          almacen_id: string
          cantidad: number
          costo_unitario?: number | null
          direccion?: number
          documento_id?: string | null
          id?: string
          motivo?: string | null
          orden_trabajo_id?: string | null
          presupuesto_ejecucion_id?: string | null
          registrado_at?: string
          registrado_por?: string | null
          repuesto_id: string
          tenant_id: string
          tercero_id?: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          costo_unitario?: number | null
          direccion?: number
          documento_id?: string | null
          id?: string
          motivo?: string | null
          orden_trabajo_id?: string | null
          presupuesto_ejecucion_id?: string | null
          registrado_at?: string
          registrado_por?: string | null
          repuesto_id?: string
          tenant_id?: string
          tercero_id?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_inventario_movimientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "mant_almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_orden_trabajo_id_fkey"
            columns: ["orden_trabajo_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_presupuesto_ejecucion_id_fkey"
            columns: ["presupuesto_ejecucion_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_ejecucion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_repuesto_id_fkey"
            columns: ["repuesto_id"]
            isOneToOne: false
            referencedRelation: "mant_repuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_inventario_movimientos_transferencia_par_id_fkey"
            columns: ["transferencia_par_id"]
            isOneToOne: false
            referencedRelation: "mant_inventario_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_matriz_prioridad: {
        Row: {
          banda_criticidad: string
          created_at: string
          id: string
          prioridad_id: number
          severidad_id: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          banda_criticidad: string
          created_at?: string
          id?: string
          prioridad_id: number
          severidad_id: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          banda_criticidad?: string
          created_at?: string
          id?: string
          prioridad_id?: number
          severidad_id?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_matriz_prioridad_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_matriz_prioridad_severidad_id_fkey"
            columns: ["severidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_matriz_prioridad_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_matriz_prioridad_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_ordenes_trabajo: {
        Row: {
          acreditacion_referencia: string | null
          activo_id: string | null
          anio: number
          aprobada_at: string | null
          aprobada_por: string | null
          asignado_tercero_id: string | null
          asignado_usuario_id: string | null
          cancelada_motivo: string | null
          cerrada_at: string | null
          contrato_id: string | null
          costo_estimado: number | null
          created_at: string
          descripcion: string | null
          ejecutada_at: string | null
          estado: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite: string | null
          fecha_programada: string | null
          id: string
          incidencia_id: string | null
          iniciada_at: string | null
          inspeccion_id: string | null
          numero: number
          origen: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id: number | null
          programacion_id: string | null
          requiere_aprobacion: boolean
          requiere_parada_servicio: boolean
          requiere_trabajo_alturas: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          titulo: string
          updated_at: string | null
          ventana_hasta: string | null
        }
        Insert: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          anio?: number
          aprobada_at?: string | null
          aprobada_por?: string | null
          asignado_tercero_id?: string | null
          asignado_usuario_id?: string | null
          cancelada_motivo?: string | null
          cerrada_at?: string | null
          contrato_id?: string | null
          costo_estimado?: number | null
          created_at?: string
          descripcion?: string | null
          ejecutada_at?: string | null
          estado?: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite?: string | null
          fecha_programada?: string | null
          id?: string
          incidencia_id?: string | null
          iniciada_at?: string | null
          inspeccion_id?: string | null
          numero?: number
          origen: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id?: number | null
          programacion_id?: string | null
          requiere_aprobacion?: boolean
          requiere_parada_servicio?: boolean
          requiere_trabajo_alturas?: boolean
          requisito_id?: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          titulo: string
          updated_at?: string | null
          ventana_hasta?: string | null
        }
        Update: {
          acreditacion_referencia?: string | null
          activo_id?: string | null
          anio?: number
          aprobada_at?: string | null
          aprobada_por?: string | null
          asignado_tercero_id?: string | null
          asignado_usuario_id?: string | null
          cancelada_motivo?: string | null
          cerrada_at?: string | null
          contrato_id?: string | null
          costo_estimado?: number | null
          created_at?: string
          descripcion?: string | null
          ejecutada_at?: string | null
          estado?: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite?: string | null
          fecha_programada?: string | null
          id?: string
          incidencia_id?: string | null
          iniciada_at?: string | null
          inspeccion_id?: string | null
          numero?: number
          origen?: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id?: number | null
          programacion_id?: string | null
          requiere_aprobacion?: boolean
          requiere_parada_servicio?: boolean
          requiere_trabajo_alturas?: boolean
          requisito_id?: string | null
          tenant_id?: string
          tipo_mantenimiento_id?: number
          titulo?: string
          updated_at?: string | null
          ventana_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_ordenes_trabajo_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_asignado_tercero_id_fkey"
            columns: ["asignado_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_asignado_usuario_id_fkey"
            columns: ["asignado_usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_incidencia_fk"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "mant_incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "mant_inspecciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_programacion_id_fkey"
            columns: ["programacion_id"]
            isOneToOne: false
            referencedRelation: "mant_programaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "mant_requisito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ordenes_trabajo_tipo_mantenimiento_id_fkey"
            columns: ["tipo_mantenimiento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_ot_estado_historial: {
        Row: {
          created_at: string
          estado_anterior: Database["public"]["Enums"]["ot_estado_t"] | null
          estado_nuevo: Database["public"]["Enums"]["ot_estado_t"]
          id: string
          motivo: string | null
          ot_id: string
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          estado_anterior?: Database["public"]["Enums"]["ot_estado_t"] | null
          estado_nuevo: Database["public"]["Enums"]["ot_estado_t"]
          id?: string
          motivo?: string | null
          ot_id: string
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          estado_anterior?: Database["public"]["Enums"]["ot_estado_t"] | null
          estado_nuevo?: Database["public"]["Enums"]["ot_estado_t"]
          id?: string
          motivo?: string | null
          ot_id?: string
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_ot_estado_historial_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_estado_historial_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_estado_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_estado_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_ot_evidencias: {
        Row: {
          created_at: string
          documento_id: string
          id: string
          ot_id: string
          subido_por: string | null
          tarea_id: string | null
          tenant_id: string
          tipo_evidencia_id: number | null
        }
        Insert: {
          created_at?: string
          documento_id: string
          id?: string
          ot_id: string
          subido_por?: string | null
          tarea_id?: string | null
          tenant_id: string
          tipo_evidencia_id?: number | null
        }
        Update: {
          created_at?: string
          documento_id?: string
          id?: string
          ot_id?: string
          subido_por?: string | null
          tarea_id?: string | null
          tenant_id?: string
          tipo_evidencia_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_ot_evidencias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "mant_ot_tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_evidencias_tipo_evidencia_id_fkey"
            columns: ["tipo_evidencia_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_ot_mediciones: {
        Row: {
          atributo_definicion_id: string
          created_at: string
          fuera_de_rango: boolean
          id: string
          incidencia_generada_id: string | null
          observacion: string | null
          ot_id: string
          rango_max: number | null
          rango_min: number | null
          tarea_id: string | null
          tenant_id: string
          unidad_id: number | null
          valor: number
        }
        Insert: {
          atributo_definicion_id: string
          created_at?: string
          fuera_de_rango?: boolean
          id?: string
          incidencia_generada_id?: string | null
          observacion?: string | null
          ot_id: string
          rango_max?: number | null
          rango_min?: number | null
          tarea_id?: string | null
          tenant_id: string
          unidad_id?: number | null
          valor: number
        }
        Update: {
          atributo_definicion_id?: string
          created_at?: string
          fuera_de_rango?: boolean
          id?: string
          incidencia_generada_id?: string | null
          observacion?: string | null
          ot_id?: string
          rango_max?: number | null
          rango_min?: number | null
          tarea_id?: string | null
          tenant_id?: string
          unidad_id?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "mant_ot_mediciones_atributo_definicion_id_fkey"
            columns: ["atributo_definicion_id"]
            isOneToOne: false
            referencedRelation: "mant_atributo_definicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_incidencia_generada_id_fkey"
            columns: ["incidencia_generada_id"]
            isOneToOne: false
            referencedRelation: "mant_incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "mant_ot_tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_mediciones_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_ot_tareas: {
        Row: {
          created_at: string
          descripcion: string
          ejecutada_at: string | null
          ejecutada_por: string | null
          estado: Database["public"]["Enums"]["tarea_estado_t"]
          id: string
          no_aplica_motivo: string | null
          obligatoria: boolean
          observaciones: string | null
          orden: number
          ot_id: string
          requiere_evidencia_foto: boolean
          requiere_medicion: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          ejecutada_at?: string | null
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["tarea_estado_t"]
          id?: string
          no_aplica_motivo?: string | null
          obligatoria?: boolean
          observaciones?: string | null
          orden: number
          ot_id: string
          requiere_evidencia_foto?: boolean
          requiere_medicion?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          ejecutada_at?: string | null
          ejecutada_por?: string | null
          estado?: Database["public"]["Enums"]["tarea_estado_t"]
          id?: string
          no_aplica_motivo?: string | null
          obligatoria?: boolean
          observaciones?: string | null
          orden?: number
          ot_id?: string
          requiere_evidencia_foto?: boolean
          requiere_medicion?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_ot_tareas_ejecutada_por_fkey"
            columns: ["ejecutada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_tareas_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_tareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_ot_tareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_plan_activos: {
        Row: {
          activo_id: string
          id: string
          plan_id: string
          resuelto_at: string
          tenant_id: string
        }
        Insert: {
          activo_id: string
          id?: string
          plan_id: string
          resuelto_at?: string
          tenant_id: string
        }
        Update: {
          activo_id?: string
          id?: string
          plan_id?: string
          resuelto_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_plan_activos_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_plan_activos_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mant_planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_plan_activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_plan_activos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_plan_tareas: {
        Row: {
          cantidad_prevista: number | null
          created_at: string
          descripcion: string
          duracion_estimada_min: number | null
          id: string
          orden: number
          plan_id: string
          repuesto_previsto_id: string | null
          requiere_evidencia_foto: boolean
          requiere_medicion: boolean
          tenant_id: string
        }
        Insert: {
          cantidad_prevista?: number | null
          created_at?: string
          descripcion: string
          duracion_estimada_min?: number | null
          id?: string
          orden: number
          plan_id: string
          repuesto_previsto_id?: string | null
          requiere_evidencia_foto?: boolean
          requiere_medicion?: boolean
          tenant_id: string
        }
        Update: {
          cantidad_prevista?: number | null
          created_at?: string
          descripcion?: string
          duracion_estimada_min?: number | null
          id?: string
          orden?: number
          plan_id?: string
          repuesto_previsto_id?: string | null
          requiere_evidencia_foto?: boolean
          requiere_medicion?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_plan_tareas_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mant_planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_plan_tareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_plan_tareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_planes: {
        Row: {
          activo: boolean
          alcance: Database["public"]["Enums"]["plan_alcance_t"]
          alcance_activo_id: string | null
          alcance_agrupacion_id: string | null
          alcance_categoria_id: number | null
          alcance_tipo_activo_id: number | null
          alcance_zona_comun_id: string | null
          codigo: string
          contrato_id: string | null
          created_at: string
          descripcion: string | null
          duracion_estimada_min: number | null
          encadenar_desde_ejecucion_real: boolean
          frecuencia_meses: number
          frecuencia_origen: Database["public"]["Enums"]["plan_frecuencia_origen_t"]
          horizonte_meses: number
          id: string
          nombre: string
          requiere_parada_servicio: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          updated_at: string | null
          ventana_dias: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          alcance: Database["public"]["Enums"]["plan_alcance_t"]
          alcance_activo_id?: string | null
          alcance_agrupacion_id?: string | null
          alcance_categoria_id?: number | null
          alcance_tipo_activo_id?: number | null
          alcance_zona_comun_id?: string | null
          codigo: string
          contrato_id?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_estimada_min?: number | null
          encadenar_desde_ejecucion_real?: boolean
          frecuencia_meses: number
          frecuencia_origen: Database["public"]["Enums"]["plan_frecuencia_origen_t"]
          horizonte_meses: number
          id?: string
          nombre: string
          requiere_parada_servicio?: boolean
          requisito_id?: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          updated_at?: string | null
          ventana_dias: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          alcance?: Database["public"]["Enums"]["plan_alcance_t"]
          alcance_activo_id?: string | null
          alcance_agrupacion_id?: string | null
          alcance_categoria_id?: number | null
          alcance_tipo_activo_id?: number | null
          alcance_zona_comun_id?: string | null
          codigo?: string
          contrato_id?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_estimada_min?: number | null
          encadenar_desde_ejecucion_real?: boolean
          frecuencia_meses?: number
          frecuencia_origen?: Database["public"]["Enums"]["plan_frecuencia_origen_t"]
          horizonte_meses?: number
          id?: string
          nombre?: string
          requiere_parada_servicio?: boolean
          requisito_id?: string | null
          tenant_id?: string
          tipo_mantenimiento_id?: number
          updated_at?: string | null
          ventana_dias?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_planes_alcance_activo_id_fkey"
            columns: ["alcance_activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_alcance_agrupacion_id_fkey"
            columns: ["alcance_agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_alcance_categoria_id_fkey"
            columns: ["alcance_categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_alcance_tipo_activo_id_fkey"
            columns: ["alcance_tipo_activo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_alcance_zona_comun_id_fkey"
            columns: ["alcance_zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_requisito_id_fkey"
            columns: ["requisito_id"]
            isOneToOne: false
            referencedRelation: "mant_requisito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_planes_tipo_mantenimiento_id_fkey"
            columns: ["tipo_mantenimiento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_politica_aprobacion_ot: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          exige_por_parada_servicio: boolean
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          exige_por_parada_servicio?: boolean
          id?: string
          monto_umbral?: number | null
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          exige_por_parada_servicio?: boolean
          id?: string
          monto_umbral?: number | null
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_politica_aprobacion_ot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_politica_aprobacion_ot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_programaciones: {
        Row: {
          activo_id: string
          created_at: string
          estado: Database["public"]["Enums"]["programacion_estado_t"]
          fecha_programada: string
          generada_at: string | null
          id: string
          omitida_motivo: string | null
          orden_trabajo_id: string | null
          plan_id: string
          tenant_id: string
          ventana_hasta: string
        }
        Insert: {
          activo_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["programacion_estado_t"]
          fecha_programada: string
          generada_at?: string | null
          id?: string
          omitida_motivo?: string | null
          orden_trabajo_id?: string | null
          plan_id: string
          tenant_id: string
          ventana_hasta: string
        }
        Update: {
          activo_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["programacion_estado_t"]
          fecha_programada?: string
          generada_at?: string | null
          id?: string
          omitida_motivo?: string | null
          orden_trabajo_id?: string | null
          plan_id?: string
          tenant_id?: string
          ventana_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_programaciones_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_programaciones_orden_trabajo_fk"
            columns: ["orden_trabajo_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_programaciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mant_planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_programaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_programaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_proveedor_evaluacion: {
        Row: {
          created_at: string
          criterios: Json
          evaluado_por: string | null
          id: string
          observaciones: string | null
          periodo: string
          puntaje: number
          tenant_id: string
          tercero_id: string
        }
        Insert: {
          created_at?: string
          criterios: Json
          evaluado_por?: string | null
          id?: string
          observaciones?: string | null
          periodo: string
          puntaje: number
          tenant_id: string
          tercero_id: string
        }
        Update: {
          created_at?: string
          criterios?: Json
          evaluado_por?: string | null
          id?: string
          observaciones?: string | null
          periodo?: string
          puntaje?: number
          tenant_id?: string
          tercero_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_proveedor_evaluacion_evaluado_por_fkey"
            columns: ["evaluado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_evaluacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_evaluacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_evaluacion_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_proveedor_habilitacion: {
        Row: {
          created_at: string
          documento_id: string | null
          entidad_emisora: string | null
          id: string
          numero_referencia: string | null
          tenant_id: string
          tercero_id: string
          tipo_id: number
          updated_at: string | null
          verificado_at: string | null
          verificado_por: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          entidad_emisora?: string | null
          id?: string
          numero_referencia?: string | null
          tenant_id: string
          tercero_id: string
          tipo_id: number
          updated_at?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          entidad_emisora?: string | null
          id?: string
          numero_referencia?: string | null
          tenant_id?: string
          tercero_id?: string
          tipo_id?: number
          updated_at?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_proveedor_habilitacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_habilitacion_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_registros_acceso: {
        Row: {
          autorizacion_id: string | null
          egreso_at: string | null
          id: string
          ingreso_at: string
          inmueble_destino_id: string
          observaciones: string | null
          registrado_por: string
          tenant_id: string
          visitante_documento: string | null
          visitante_nombre: string
        }
        Insert: {
          autorizacion_id?: string | null
          egreso_at?: string | null
          id?: string
          ingreso_at?: string
          inmueble_destino_id: string
          observaciones?: string | null
          registrado_por: string
          tenant_id: string
          visitante_documento?: string | null
          visitante_nombre: string
        }
        Update: {
          autorizacion_id?: string | null
          egreso_at?: string | null
          id?: string
          ingreso_at?: string
          inmueble_destino_id?: string
          observaciones?: string | null
          registrado_por?: string
          tenant_id?: string
          visitante_documento?: string | null
          visitante_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_registros_acceso_autorizacion_id_fkey"
            columns: ["autorizacion_id"]
            isOneToOne: false
            referencedRelation: "mant_autorizaciones_visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_inmueble_destino_id_fkey"
            columns: ["inmueble_destino_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_inmueble_destino_id_fkey"
            columns: ["inmueble_destino_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_repuestos: {
        Row: {
          activo: boolean
          categoria_id: number
          codigo_barras: string | null
          contable_cuenta_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          punto_reorden: number | null
          sku: string
          stock_maximo: number | null
          stock_minimo: number | null
          tenant_id: string
          tercero_preferido_id: string | null
          unidad_id: number | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          categoria_id: number
          codigo_barras?: string | null
          contable_cuenta_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          punto_reorden?: number | null
          sku: string
          stock_maximo?: number | null
          stock_minimo?: number | null
          tenant_id: string
          tercero_preferido_id?: string | null
          unidad_id?: number | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          categoria_id?: number
          codigo_barras?: string | null
          contable_cuenta_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          punto_reorden?: number | null
          sku?: string
          stock_maximo?: number | null
          stock_minimo?: number | null
          tenant_id?: string
          tercero_preferido_id?: string | null
          unidad_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_repuestos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_repuestos_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_repuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_repuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_repuestos_tercero_preferido_id_fkey"
            columns: ["tercero_preferido_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_repuestos_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_requisito: {
        Row: {
          activo: boolean
          codigo: string | null
          created_at: string
          detalle: string | null
          frecuencia_meses: number | null
          fuente_url: string | null
          id: string
          nombre: string
          norma_referencia: string | null
          requiere_tercero_acreditado: boolean
          tenant_id: string | null
          tipo_activo_id: number | null
          tipo_fundamento: Database["public"]["Enums"]["requisito_tipo_t"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          detalle?: string | null
          frecuencia_meses?: number | null
          fuente_url?: string | null
          id?: string
          nombre: string
          norma_referencia?: string | null
          requiere_tercero_acreditado?: boolean
          tenant_id?: string | null
          tipo_activo_id?: number | null
          tipo_fundamento: Database["public"]["Enums"]["requisito_tipo_t"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          detalle?: string | null
          frecuencia_meses?: number | null
          fuente_url?: string | null
          id?: string
          nombre?: string
          norma_referencia?: string | null
          requiere_tercero_acreditado?: boolean
          tenant_id?: string | null
          tipo_activo_id?: number | null
          tipo_fundamento?: Database["public"]["Enums"]["requisito_tipo_t"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_requisito_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_requisito_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_requisito_tipo_activo_id_fkey"
            columns: ["tipo_activo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_reservas: {
        Row: {
          aprobada_at: string | null
          aprobada_por: string | null
          cargo_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          inmueble_id: string
          motivo_cancelacion: string | null
          motivo_rechazo: string | null
          penalizada: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo: number | null
        }
        Insert: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cargo_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          inmueble_id: string
          motivo_cancelacion?: string | null
          motivo_rechazo?: string | null
          penalizada?: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref?: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo?: number | null
        }
        Update: {
          aprobada_at?: string | null
          aprobada_por?: string | null
          cargo_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["reserva_estado_t"]
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          inmueble_id?: string
          motivo_cancelacion?: string | null
          motivo_rechazo?: string | null
          penalizada?: boolean
          solicitante_origen?: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref?: string | null
          tenant_id?: string
          zona_comun_id?: string
          zona_cupo_simultaneo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_reservas_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_reservas_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_salud_banda: {
        Row: {
          created_at: string
          etiqueta: string
          id: string
          orden: number
          puntaje_desde: number
          puntaje_hasta: number | null
          set_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          etiqueta: string
          id?: string
          orden?: number
          puntaje_desde: number
          puntaje_hasta?: number | null
          set_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          etiqueta?: string
          id?: string
          orden?: number
          puntaje_desde?: number
          puntaje_hasta?: number | null
          set_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_salud_banda_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "mant_salud_set"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_banda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_banda_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_salud_factor: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          escala: Json
          fuente_id: number
          id: string
          nombre: string
          peso: number
          set_id: string
          tenant_id: string
          ventana_dias: number
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          escala: Json
          fuente_id: number
          id?: string
          nombre: string
          peso: number
          set_id: string
          tenant_id: string
          ventana_dias?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          escala?: Json
          fuente_id?: number
          id?: string
          nombre?: string
          peso?: number
          set_id?: string
          tenant_id?: string
          ventana_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "mant_salud_factor_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_factor_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "mant_salud_set"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_factor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_factor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_salud_set: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_salud_set_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_set_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_salud_snapshot: {
        Row: {
          activo_id: string
          created_at: string
          detalle: Json
          fecha: string
          id: string
          indice: number
          registrado_por: string | null
          tenant_id: string
          version_factores: number
        }
        Insert: {
          activo_id: string
          created_at?: string
          detalle: Json
          fecha: string
          id?: string
          indice: number
          registrado_por?: string | null
          tenant_id: string
          version_factores: number
        }
        Update: {
          activo_id?: string
          created_at?: string
          detalle?: Json
          fecha?: string
          id?: string
          indice?: number
          registrado_por?: string | null
          tenant_id?: string
          version_factores?: number
        }
        Relationships: [
          {
            foreignKeyName: "mant_salud_snapshot_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_snapshot_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_salud_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mant_zona_reserva_regla: {
        Row: {
          anticipacion_maxima_dias: number | null
          anticipacion_minima_horas: number | null
          concepto_id: string | null
          created_at: string
          cupo_simultaneo: number
          duracion_maxima_minutos: number | null
          genera_cargo: boolean
          id: string
          maximo_activas_por_inmueble: number | null
          penalidad_cancelacion_tardia_horas: number | null
          requiere_aprobacion: boolean
          tenant_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
          zona_comun_id: string
        }
        Insert: {
          anticipacion_maxima_dias?: number | null
          anticipacion_minima_horas?: number | null
          concepto_id?: string | null
          created_at?: string
          cupo_simultaneo?: number
          duracion_maxima_minutos?: number | null
          genera_cargo?: boolean
          id?: string
          maximo_activas_por_inmueble?: number | null
          penalidad_cancelacion_tardia_horas?: number | null
          requiere_aprobacion: boolean
          tenant_id: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
          zona_comun_id: string
        }
        Update: {
          anticipacion_maxima_dias?: number | null
          anticipacion_minima_horas?: number | null
          concepto_id?: string | null
          created_at?: string
          cupo_simultaneo?: number
          duracion_maxima_minutos?: number | null
          genera_cargo?: boolean
          id?: string
          maximo_activas_por_inmueble?: number | null
          penalidad_cancelacion_tardia_horas?: number | null
          requiere_aprobacion?: boolean
          tenant_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
          zona_comun_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mant_zona_reserva_regla_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_zona_reserva_regla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_zona_reserva_regla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_zona_reserva_regla_zona_comun_id_fkey"
            columns: ["zona_comun_id"]
            isOneToOne: false
            referencedRelation: "zonas_comunes"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles_funcionales: {
        Row: {
          asignado_en: string
          asignado_por: string | null
          id: string
          membership_id: string
          rol_funcional_id: number
        }
        Insert: {
          asignado_en?: string
          asignado_por?: string | null
          id?: string
          membership_id: string
          rol_funcional_id: number
        }
        Update: {
          asignado_en?: string
          asignado_por?: string | null
          id?: string
          membership_id?: string
          rol_funcional_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_funcionales_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_funcionales_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_funcionales_rol_funcional_id_fkey"
            columns: ["rol_funcional_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["member_status_t"]
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["member_status_t"]
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role_t"]
          status?: Database["public"]["Enums"]["member_status_t"]
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion_lectura: {
        Row: {
          leida_at: string
          notificacion_id: string
          user_id: string
        }
        Insert: {
          leida_at?: string
          notificacion_id: string
          user_id: string
        }
        Update: {
          leida_at?: string
          notificacion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_lectura_notificacion_id_fkey"
            columns: ["notificacion_id"]
            isOneToOne: false
            referencedRelation: "notificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          created_at: string
          cuerpo: string | null
          enlace: string | null
          id: string
          modulo: string
          origen_entidad: string
          origen_evento: string
          origen_id: string | null
          origen_modulo: string
          prioridad_id: number
          tenant_id: string
          tipo_id: number
          titulo: string
        }
        Insert: {
          created_at?: string
          cuerpo?: string | null
          enlace?: string | null
          id?: string
          modulo: string
          origen_entidad: string
          origen_evento: string
          origen_id?: string | null
          origen_modulo: string
          prioridad_id: number
          tenant_id: string
          tipo_id: number
          titulo: string
        }
        Update: {
          created_at?: string
          cuerpo?: string | null
          enlace?: string | null
          id?: string
          modulo?: string
          origen_entidad?: string
          origen_evento?: string
          origen_id?: string | null
          origen_modulo?: string
          prioridad_id?: number
          tenant_id?: string
          tipo_id?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      novedad_cuotas: {
        Row: {
          cargo_id: string | null
          generada_at: string | null
          id: string
          monto_cuota: number
          novedad_id: string
          numero_cuota: number
          periodo_id: string | null
          tenant_id: string
        }
        Insert: {
          cargo_id?: string | null
          generada_at?: string | null
          id?: string
          monto_cuota: number
          novedad_id: string
          numero_cuota: number
          periodo_id?: string | null
          tenant_id: string
        }
        Update: {
          cargo_id?: string | null
          generada_at?: string | null
          id?: string
          monto_cuota?: number
          novedad_id?: string
          numero_cuota?: number
          periodo_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "novedad_cuotas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_cuotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      novedad_tipo_cuenta: {
        Row: {
          created_at: string
          presupuesto_cuenta_id: string
          tenant_id: string
          tipo_novedad_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          presupuesto_cuenta_id: string
          tenant_id: string
          tipo_novedad_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          presupuesto_cuenta_id?: string
          tenant_id?: string
          tipo_novedad_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "novedad_tipo_cuenta_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedad_tipo_cuenta_tipo_novedad_id_fkey"
            columns: ["tipo_novedad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      novedades: {
        Row: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_motivo: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        Insert: {
          acuerdo_pago_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by: string
          cuotas_totales?: number | null
          descripcion: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id?: string
          inhabilitada_at?: string | null
          inhabilitada_motivo?: string | null
          inhabilitada_por?: string | null
          inmueble_id: string
          monto: number
          permanente?: boolean
          presupuesto_cuenta_id?: string | null
          prorrateable?: boolean
          rejected_reason?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id?: number | null
        }
        Update: {
          acuerdo_pago_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by?: string
          cuotas_totales?: number | null
          descripcion?: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva?: string
          id?: string
          inhabilitada_at?: string | null
          inhabilitada_motivo?: string | null
          inhabilitada_por?: string | null
          inmueble_id?: string
          monto?: number
          permanente?: boolean
          presupuesto_cuenta_id?: string | null
          prorrateable?: boolean
          rejected_reason?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "novedades_acuerdo_pago_id_fkey"
            columns: ["acuerdo_pago_id"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inhabilitada_por_fkey"
            columns: ["inhabilitada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_presupuesto_cuenta_id_fkey"
            columns: ["presupuesto_cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "novedades_tipo_novedad_id_fkey"
            columns: ["tipo_novedad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_aplicaciones: {
        Row: {
          aplicacion_original_id: string | null
          cargo_id: string
          created_at: string
          id: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Insert: {
          aplicacion_original_id?: string | null
          cargo_id: string
          created_at?: string
          id?: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Update: {
          aplicacion_original_id?: string | null
          cargo_id?: string
          created_at?: string
          id?: string
          monto?: number
          pago_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_aplicaciones_aplicacion_original_id_fkey"
            columns: ["aplicacion_original_id"]
            isOneToOne: false
            referencedRelation: "pago_aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          acuerdo_cuota_id: string | null
          anulado_motivo: string | null
          created_at: string
          cuenta_bancaria_id: string | null
          fecha_pago: string
          fecha_registro: string
          forma_pago_id: number
          id: string
          inmueble_id: string
          intencion_pago_id: string | null
          monto: number
          observaciones: string | null
          pagador_documento: string | null
          pagador_nombre: string | null
          pagador_tercero_id: string | null
          pago_original_id: string | null
          referencia: string | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          acuerdo_cuota_id?: string | null
          anulado_motivo?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          fecha_pago: string
          fecha_registro?: string
          forma_pago_id: number
          id?: string
          inmueble_id: string
          intencion_pago_id?: string | null
          monto: number
          observaciones?: string | null
          pagador_documento?: string | null
          pagador_nombre?: string | null
          pagador_tercero_id?: string | null
          pago_original_id?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          acuerdo_cuota_id?: string | null
          anulado_motivo?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          fecha_pago?: string
          fecha_registro?: string
          forma_pago_id?: number
          id?: string
          inmueble_id?: string
          intencion_pago_id?: string | null
          monto?: number
          observaciones?: string | null
          pagador_documento?: string | null
          pagador_nombre?: string | null
          pagador_tercero_id?: string | null
          pago_original_id?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_acuerdo_cuota_id_fkey"
            columns: ["acuerdo_cuota_id"]
            isOneToOne: false
            referencedRelation: "acuerdo_pago_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_forma_pago_id_fkey"
            columns: ["forma_pago_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_intencion_pago_id_fkey"
            columns: ["intencion_pago_id"]
            isOneToOne: false
            referencedRelation: "intenciones_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_pagador_tercero_id_fkey"
            columns: ["pagador_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_pago_original_id_fkey"
            columns: ["pago_original_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pasarela_config: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          identificador_publico: string | null
          modo: Database["public"]["Enums"]["pasarela_modo_t"]
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          tenant_id: string
          updated_at: string | null
          verificada_at: string | null
          webhook_token: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          identificador_publico?: string | null
          modo?: Database["public"]["Enums"]["pasarela_modo_t"]
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          tenant_id: string
          updated_at?: string | null
          verificada_at?: string | null
          webhook_token?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          identificador_publico?: string | null
          modo?: Database["public"]["Enums"]["pasarela_modo_t"]
          proveedor?: Database["public"]["Enums"]["pasarela_proveedor_t"]
          tenant_id?: string
          updated_at?: string | null
          verificada_at?: string | null
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasarela_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pasarela_config_metodo: {
        Row: {
          config_id: string
          created_at: string
          forma_pago_id: number
          tenant_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          forma_pago_id: number
          tenant_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          forma_pago_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasarela_config_metodo_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "pasarela_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_config_metodo_forma_pago_id_fkey"
            columns: ["forma_pago_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_config_metodo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_config_metodo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pasarela_credencial: {
        Row: {
          config_id: string
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          tenant_id: string
          vault_secret_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          tenant_id: string
          vault_secret_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          tenant_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasarela_credencial_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "pasarela_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_credencial_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_credencial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasarela_credencial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos: {
        Row: {
          anio: number
          cerrado_at: string | null
          cerrado_por: string | null
          contable_cerrado_at: string | null
          contable_cerrado_por: string | null
          contable_estado: Database["public"]["Enums"]["contable_periodo_estado_t"]
          contable_reabierto_motivo: string | null
          created_at: string
          estado: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento: string | null
          id: string
          mensaje_divulgacion: string | null
          mes: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          contable_cerrado_at?: string | null
          contable_cerrado_por?: string | null
          contable_estado?: Database["public"]["Enums"]["contable_periodo_estado_t"]
          contable_reabierto_motivo?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
          mensaje_divulgacion?: string | null
          mes: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          contable_cerrado_at?: string | null
          contable_cerrado_por?: string | null
          contable_estado?: Database["public"]["Enums"]["contable_periodo_estado_t"]
          contable_reabierto_motivo?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
          mensaje_divulgacion?: string | null
          mes?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "periodos_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_contable_cerrado_por_fkey"
            columns: ["contable_cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_compositor: {
        Row: {
          activa: boolean
          asunto: string
          creado_por: string | null
          created_at: string
          cuerpo: string
          id: string
          nombre: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          asunto: string
          creado_por?: string | null
          created_at?: string
          cuerpo: string
          id?: string
          nombre: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          asunto?: string
          creado_por?: string | null
          created_at?: string
          cuerpo?: string
          id?: string
          nombre?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_compositor_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_compositor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_compositor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_email_versiones: {
        Row: {
          creado_por: string | null
          created_at: string
          event_type: string
          html_content: string
          id: string
          plantilla_id: string
          subject: string
          tenant_id: string
          version: number
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          event_type: string
          html_content: string
          id?: string
          plantilla_id: string
          subject: string
          tenant_id: string
          version: number
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          event_type?: string
          html_content?: string
          id?: string
          plantilla_id?: string
          subject?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_email_versiones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_email_versiones_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_email_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_email_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_frases_prohibidas: {
        Row: {
          activo: boolean
          categoria: string
          created_at: string
          descripcion: string
          fundamento: string
          id: number
          patron: string
        }
        Insert: {
          activo?: boolean
          categoria: string
          created_at?: string
          descripcion: string
          fundamento: string
          id?: never
          patron: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          created_at?: string
          descripcion?: string
          fundamento?: string
          id?: never
          patron?: string
        }
        Relationships: []
      }
      plantillas_sms: {
        Row: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuerpo: string
          event_type: string
          id?: string
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuerpo?: string
          event_type?: string
          id?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_sms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_sms_versiones: {
        Row: {
          creado_por: string | null
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          plantilla_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          cuerpo: string
          event_type: string
          id?: string
          plantilla_id: string
          tenant_id: string
          version: number
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          cuerpo?: string
          event_type?: string
          id?: string
          plantilla_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_sms_versiones_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_versiones_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas_sms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantillas_sms_versiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      politica_clasificacion_tramos: {
        Row: {
          codigo: string
          created_at: string
          dias_max: number | null
          dias_min: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre: string
          orden: number
          politica_id: string
          prioridad: number
          tenant_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          dias_max?: number | null
          dias_min: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          id?: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre: string
          orden: number
          politica_id: string
          prioridad: number
          tenant_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          dias_max?: number | null
          dias_min?: number
          etapa_cobranza?: Database["public"]["Enums"]["etapa_cobranza_t"]
          id?: string
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo_t"]
          nombre?: string
          orden?: number
          politica_id?: string
          prioridad?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "politica_clasificacion_tramos_politica_id_fkey"
            columns: ["politica_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politica_clasificacion_tramos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politica_clasificacion_tramos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_clasificacion_cartera: {
        Row: {
          acta_referencia: string | null
          aprobada_por: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          nombre: string
          policy_hash: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_referencia?: string | null
          aprobada_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre: string
          policy_hash: string
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_referencia?: string | null
          aprobada_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          id?: string
          nombre?: string
          policy_hash?: string
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicas_clasificacion_cartera_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_clasificacion_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_clasificacion_cartera_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_financieras: {
        Row: {
          coeficientes_suma_esperada: number
          created_at: string
          descuento_pronto_pago_dias: number
          descuento_pronto_pago_modo: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje: number
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje: number | null
          id: string
          imputacion_estrategia: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden: Json
          interes_day_count: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia: number
          interes_mora_compensa_creditos: boolean
          interes_multiplicador: number | null
          interes_tasa_mensual: number | null
          interes_tipo_tasa:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual: number | null
          policy_hash: string
          reconocimiento_ingreso: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala: number
          redondeo_modo: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          coeficientes_suma_esperada?: number
          created_at?: string
          descuento_pronto_pago_dias?: number
          descuento_pronto_pago_modo?: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base?:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_estrategia?: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden?: Json
          interes_day_count?: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden?: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia?: number
          interes_mora_compensa_creditos?: boolean
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash: string
          reconocimiento_ingreso?: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala?: number
          redondeo_modo?: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo?: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          coeficientes_suma_esperada?: number
          created_at?: string
          descuento_pronto_pago_dias?: number
          descuento_pronto_pago_modo?: Database["public"]["Enums"]["descuento_pronto_pago_modo_t"]
          descuento_pronto_pago_porcentaje?: number
          estado?: Database["public"]["Enums"]["vigencia_estado_t"]
          fondo_imprevistos_base?:
            | Database["public"]["Enums"]["fondo_base_calculo_t"]
            | null
          fondo_imprevistos_porcentaje?: number | null
          id?: string
          imputacion_estrategia?: Database["public"]["Enums"]["politica_imputacion_estrategia_t"]
          imputacion_orden?: Json
          interes_day_count?: Database["public"]["Enums"]["interes_day_count_t"]
          interes_descuento_orden?: Database["public"]["Enums"]["interes_descuento_orden_t"]
          interes_dias_gracia?: number
          interes_mora_compensa_creditos?: boolean
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash?: string
          reconocimiento_ingreso?: Database["public"]["Enums"]["presupuesto_reconocimiento_ingreso_t"]
          redondeo_escala?: number
          redondeo_modo?: Database["public"]["Enums"]["redondeo_modo_t"]
          residual_metodo?: Database["public"]["Enums"]["residual_metodo_t"]
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicas_financieras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_financieras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      posiciones_cartera_snapshot: {
        Row: {
          cantidad_cargos_vencidos: number
          cargo_vencido_mas_antiguo_id: string | null
          clasificacion_codigo: string
          created_at: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte: string
          fecha_vencimiento_mas_antigua: string | null
          id: string
          inmueble_id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id: string
          politica_version: number
          posicion_hash: string
          saldo_credito: number
          tenant_id: string
        }
        Insert: {
          cantidad_cargos_vencidos?: number
          cargo_vencido_mas_antiguo_id?: string | null
          clasificacion_codigo: string
          created_at?: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          etapa_cobranza: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte: string
          fecha_vencimiento_mas_antigua?: string | null
          id?: string
          inmueble_id: string
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id: string
          politica_version: number
          posicion_hash: string
          saldo_credito?: number
          tenant_id: string
        }
        Update: {
          cantidad_cargos_vencidos?: number
          cargo_vencido_mas_antiguo_id?: string | null
          clasificacion_codigo?: string
          created_at?: string
          deuda_capital?: number
          deuda_interes?: number
          deuda_otros?: number
          deuda_total?: number
          dias_mora_maximo?: number
          etapa_cobranza?: Database["public"]["Enums"]["etapa_cobranza_t"]
          fecha_corte?: string
          fecha_vencimiento_mas_antigua?: string | null
          id?: string
          inmueble_id?: string
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo_t"]
          politica_clasificacion_id?: string
          politica_version?: number
          posicion_hash?: string
          saldo_credito?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posiciones_cartera_snapshot_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_politica_clasificacion_id_fkey"
            columns: ["politica_clasificacion_id"]
            isOneToOne: false
            referencedRelation: "politicas_clasificacion_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posiciones_cartera_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescripcion_actos_interruptivos: {
        Row: {
          caso_id: string | null
          created_at: string
          descripcion: string
          documento_id: string | null
          fecha_ocurrencia: string
          id: string
          inmueble_id: string
          pago_id: string | null
          registrado_por: string
          tenant_id: string
          tipo_acto_id: number
        }
        Insert: {
          caso_id?: string | null
          created_at?: string
          descripcion: string
          documento_id?: string | null
          fecha_ocurrencia: string
          id?: string
          inmueble_id: string
          pago_id?: string | null
          registrado_por: string
          tenant_id: string
          tipo_acto_id: number
        }
        Update: {
          caso_id?: string | null
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          fecha_ocurrencia?: string
          id?: string
          inmueble_id?: string
          pago_id?: string | null
          registrado_por?: string
          tenant_id?: string
          tipo_acto_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescripcion_actos_interruptivos_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescripcion_actos_interruptivos_tipo_acto_id_fkey"
            columns: ["tipo_acto_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_cuenta: {
        Row: {
          activa: boolean
          busqueda_tsv: unknown
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          es_hoja: boolean
          id: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden: number
          parent_id: string | null
          ruta: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          busqueda_tsv?: unknown
          codigo: string
          contable_cuenta_id?: string | null
          created_at?: string
          es_hoja?: boolean
          id?: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre: string
          orden?: number
          parent_id?: string | null
          ruta?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          busqueda_tsv?: unknown
          codigo?: string
          contable_cuenta_id?: string | null
          created_at?: string
          es_hoja?: boolean
          id?: string
          naturaleza?: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre?: string
          orden?: number
          parent_id?: string | null
          ruta?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_cuenta_contable_cuenta_id_fkey"
            columns: ["contable_cuenta_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cuenta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_cuenta_plantilla: {
        Row: {
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden: number
          parent_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          naturaleza: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel: number
          nombre: string
          orden?: number
          parent_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["presupuesto_cuenta_naturaleza_t"]
          nivel?: number
          nombre?: string
          orden?: number
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_cuenta_plantilla_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta_plantilla"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_ejecucion: {
        Row: {
          activo_id: string | null
          agrupacion_id: string | null
          ajusta_movimiento_id: string | null
          centro_costo_id: number | null
          contrato_id: string | null
          created_at: string
          cuenta_bancaria_id: string | null
          cuenta_id: string
          descripcion: string | null
          fecha_documento: string | null
          id: string
          liquidacion: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto: number
          orden_trabajo_id: string | null
          periodo_id: string
          referencia: string | null
          registrado_por: string | null
          tenant_id: string
          tercero_id: string | null
        }
        Insert: {
          activo_id?: string | null
          agrupacion_id?: string | null
          ajusta_movimiento_id?: string | null
          centro_costo_id?: number | null
          contrato_id?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          cuenta_id: string
          descripcion?: string | null
          fecha_documento?: string | null
          id?: string
          liquidacion: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto: number
          orden_trabajo_id?: string | null
          periodo_id: string
          referencia?: string | null
          registrado_por?: string | null
          tenant_id: string
          tercero_id?: string | null
        }
        Update: {
          activo_id?: string | null
          agrupacion_id?: string | null
          ajusta_movimiento_id?: string | null
          centro_costo_id?: number | null
          contrato_id?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          cuenta_id?: string
          descripcion?: string | null
          fecha_documento?: string | null
          id?: string
          liquidacion?: Database["public"]["Enums"]["ejecucion_liquidacion_t"]
          monto?: number
          orden_trabajo_id?: string | null
          periodo_id?: string
          referencia?: string | null
          registrado_por?: string | null
          tenant_id?: string
          tercero_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_ejecucion_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_ajusta_movimiento_id_fkey"
            columns: ["ajusta_movimiento_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_ejecucion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "mant_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_orden_trabajo_id_fkey"
            columns: ["orden_trabajo_id"]
            isOneToOne: false
            referencedRelation: "mant_ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_ejecucion_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_rubros: {
        Row: {
          agrupacion_id: string | null
          centro_costo_id: number | null
          codigo: string
          created_at: string
          cuenta_id: string
          fundamento_normativo_id: number | null
          id: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          codigo: string
          created_at?: string
          cuenta_id: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          agrupacion_id?: string | null
          centro_costo_id?: number | null
          codigo?: string
          created_at?: string
          cuenta_id?: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual?: number
          nombre?: string
          presupuesto_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_rubros_agrupacion_id_fkey"
            columns: ["agrupacion_id"]
            isOneToOne: false
            referencedRelation: "agrupaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_rubros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          acta_asamblea: string | null
          anio: number
          created_at: string
          decision_id: string | null
          estado: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion: string | null
          id: string
          monto_total: number
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          acta_asamblea?: string | null
          anio: number
          created_at?: string
          decision_id?: string | null
          estado?: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion?: string | null
          id?: string
          monto_total: number
          tenant_id: string
          updated_at?: string | null
          version: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          acta_asamblea?: string | null
          anio?: number
          created_at?: string
          decision_id?: string | null
          estado?: Database["public"]["Enums"]["presupuesto_estado_t"]
          fecha_aprobacion?: string | null
          id?: string
          monto_total?: number
          tenant_id?: string
          updated_at?: string | null
          version?: number
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          navigation_shortcuts: Json
          phone: string | null
          status: Database["public"]["Enums"]["user_status_t"]
          tenant_predeterminado_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          navigation_shortcuts?: Json
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
          tenant_predeterminado_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          navigation_shortcuts?: Json
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
          tenant_predeterminado_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_predeterminado_id_fkey"
            columns: ["tenant_predeterminado_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_predeterminado_id_fkey"
            columns: ["tenant_predeterminado_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promesas_pago: {
        Row: {
          accion_cobranza_id: string | null
          created_at: string
          cumplida_at: string | null
          estado: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida: string
          fecha_promesa: string
          id: string
          inmueble_id: string
          monto_cumplido: number | null
          monto_prometido: number
          notas: string | null
          pago_id: string | null
          registrada_por: string | null
          tenant_id: string
        }
        Insert: {
          accion_cobranza_id?: string | null
          created_at?: string
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida: string
          fecha_promesa: string
          id?: string
          inmueble_id: string
          monto_cumplido?: number | null
          monto_prometido: number
          notas?: string | null
          pago_id?: string | null
          registrada_por?: string | null
          tenant_id: string
        }
        Update: {
          accion_cobranza_id?: string | null
          created_at?: string
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["estado_promesa_t"]
          fecha_pago_prometida?: string
          fecha_promesa?: string
          id?: string
          inmueble_id?: string
          monto_cumplido?: number | null
          monto_prometido?: number
          notas?: string | null
          pago_id?: string | null
          registrada_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promesas_pago_accion_cobranza_id_fkey"
            columns: ["accion_cobranza_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promesas_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
        }
        Relationships: []
      }
      recibos_caja: {
        Row: {
          created_at: string
          datos: Json
          folio: string
          generado_por: string | null
          id: string
          inmueble_id: string
          pago_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          datos: Json
          folio: string
          generado_por?: string | null
          id?: string
          inmueble_id: string
          pago_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          datos?: Json
          folio?: string
          generado_por?: string | null
          id?: string
          inmueble_id?: string
          pago_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recibos_caja_generado_por_fkey"
            columns: ["generado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_caja_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_caja_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_caja_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: true
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_caja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_caja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rol_funcional_modulo: {
        Row: {
          lista_tipos_id: number
          modulo: string
        }
        Insert: {
          lista_tipos_id: number
          modulo: string
        }
        Update: {
          lista_tipos_id?: number
          modulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_funcional_modulo_lista_tipos_id_fkey"
            columns: ["lista_tipos_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitud_actuaciones: {
        Row: {
          created_at: string
          descripcion: string
          documento_id: string | null
          es_respuesta: boolean
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          fecha: string
          id: string
          registrado_por: string | null
          solicitud_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          documento_id?: string | null
          es_respuesta?: boolean
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          fecha: string
          id?: string
          registrado_por?: string | null
          solicitud_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          documento_id?: string | null
          es_respuesta?: boolean
          estado?: Database["public"]["Enums"]["solicitud_estado_t"]
          fecha?: string
          id?: string
          registrado_por?: string | null
          solicitud_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_actuaciones_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_actuaciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_actuaciones_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_actuaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitud_consecutivo: {
        Row: {
          anio: number
          tenant_id: string
          ultimo_numero: number
          updated_at: string | null
        }
        Insert: {
          anio: number
          tenant_id: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Update: {
          anio?: number
          tenant_id?: string
          ultimo_numero?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_consecutivo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitud_encuesta: {
        Row: {
          calificacion: number
          comentario: string | null
          created_at: string
          id: string
          respondida_at: string
          solicitud_id: string
          tenant_id: string
        }
        Insert: {
          calificacion: number
          comentario?: string | null
          created_at?: string
          id?: string
          respondida_at?: string
          solicitud_id: string
          tenant_id: string
        }
        Update: {
          calificacion?: number
          comentario?: string | null
          created_at?: string
          id?: string
          respondida_at?: string
          solicitud_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_encuesta_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: true
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_encuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_encuesta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitud_sla: {
        Row: {
          categoria_id: number
          created_at: string
          horario_habil: boolean
          horas_primera_respuesta: number
          horas_resolucion: number
          id: string
          prioridad_id: number
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          categoria_id: number
          created_at?: string
          horario_habil?: boolean
          horas_primera_respuesta: number
          horas_resolucion: number
          id?: string
          prioridad_id: number
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          categoria_id?: number
          created_at?: string
          horario_habil?: boolean
          horas_primera_respuesta?: number
          horas_resolucion?: number
          id?: string
          prioridad_id?: number
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_sla_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_sla_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_sla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_sla_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_sla_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes: {
        Row: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        Insert: {
          agenda_punto_id?: string | null
          anio: number
          anulada_motivo?: string | null
          asignado_a?: string | null
          asignado_at?: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at?: string | null
          creada_por?: string | null
          created_at?: string
          decision_id?: string | null
          descripcion?: string | null
          en_espera_desde?: string | null
          estado?: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id?: string | null
          id?: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia?: string | null
          origen_actor_externo_id?: string | null
          origen_id?: number | null
          prioridad_id?: number | null
          resuelta_at?: string | null
          sla_id?: string | null
          sla_vence_at?: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo?: string | null
          triage_resuelto_at?: string | null
          triage_resuelto_por?: string | null
          updated_at?: string | null
        }
        Update: {
          agenda_punto_id?: string | null
          anio?: number
          anulada_motivo?: string | null
          asignado_a?: string | null
          asignado_at?: string | null
          asunto?: string
          calidad?: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id?: number
          cerrada_at?: string | null
          creada_por?: string | null
          created_at?: string
          decision_id?: string | null
          descripcion?: string | null
          en_espera_desde?: string | null
          estado?: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id?: string | null
          id?: string
          inmueble_id?: string
          numero?: number
          orden_trabajo_referencia?: string | null
          origen_actor_externo_id?: string | null
          origen_id?: number | null
          prioridad_id?: number | null
          resuelta_at?: string | null
          sla_id?: string | null
          sla_vence_at?: string | null
          solicitante_ref?: string
          tenant_id?: string
          tipo_id?: number
          triage_motivo_rechazo?: string | null
          triage_resuelto_at?: string | null
          triage_resuelto_por?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_agenda_punto_id_fkey"
            columns: ["agenda_punto_id"]
            isOneToOne: false
            referencedRelation: "gobierno_agenda_puntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_asignado_a_fkey"
            columns: ["asignado_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "gobierno_decisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_expediente_convivencia_id_fkey"
            columns: ["expediente_convivencia_id"]
            isOneToOne: false
            referencedRelation: "gobierno_expedientes_convivencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_origen_actor_externo_id_fkey"
            columns: ["origen_actor_externo_id"]
            isOneToOne: false
            referencedRelation: "actor_externo_vinculo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_prioridad_id_fkey"
            columns: ["prioridad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_sla_id_fkey"
            columns: ["sla_id"]
            isOneToOne: false
            referencedRelation: "solicitud_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_solicitante_ref_fkey"
            columns: ["solicitante_ref"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_triage_resuelto_por_fkey"
            columns: ["triage_resuelto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_referencia: {
        Row: {
          created_at: string
          entidad_fuente: string
          id: string
          registrada_por: string | null
          resolucion_fecha: string
          resolucion_numero: string
          tipo_tasa: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente: string | null
          valor_ea: number
          valor_mensual: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          entidad_fuente?: string
          id?: string
          registrada_por?: string | null
          resolucion_fecha: string
          resolucion_numero: string
          tipo_tasa: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente?: string | null
          valor_ea: number
          valor_mensual: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          entidad_fuente?: string
          id?: string
          registrada_por?: string | null
          resolucion_fecha?: string
          resolucion_numero?: string
          tipo_tasa?: Database["public"]["Enums"]["tipo_tasa_referencia_t"]
          url_fuente?: string | null
          valor_ea?: number
          valor_mensual?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasas_referencia_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tercero_rol: {
        Row: {
          created_at: string
          id: string
          numero_tarjeta_profesional: string | null
          recibe_notificaciones: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          numero_tarjeta_profesional?: string | null
          recibe_notificaciones?: boolean
          rol_id: number
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          numero_tarjeta_profesional?: string | null
          recibe_notificaciones?: boolean
          rol_id?: number
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tercero_rol_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tercero_rol_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          agente_retencion: boolean
          canal_notificacion: string | null
          ciudad: string | null
          compositor_correo_activo: boolean
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          dia_facturacion: number | null
          direccion: string | null
          email: string | null
          explota_bienes_comunes: boolean
          id: string
          iva_periodicidad_id: number | null
          logo_path: string | null
          logo_storage_path: string | null
          marco_clasificado_at: string | null
          marco_clasificado_por: string | null
          marco_fundamento: string | null
          marco_grupo:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          responsable_iva: boolean
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tiene_revisor_fiscal: boolean | null
          tipo_division_id: number
          updated_at: string | null
          uso_economico: Database["public"]["Enums"]["copropiedad_uso_t"] | null
          zona_horaria: string
        }
        Insert: {
          agente_retencion?: boolean
          canal_notificacion?: string | null
          ciudad?: string | null
          compositor_correo_activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          dia_facturacion?: number | null
          direccion?: string | null
          email?: string | null
          explota_bienes_comunes?: boolean
          id?: string
          iva_periodicidad_id?: number | null
          logo_path?: string | null
          logo_storage_path?: string | null
          marco_clasificado_at?: string | null
          marco_clasificado_por?: string | null
          marco_fundamento?: string | null
          marco_grupo?:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          moneda?: string
          name: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          responsable_iva?: boolean
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tiene_revisor_fiscal?: boolean | null
          tipo_division_id?: number
          updated_at?: string | null
          uso_economico?:
            | Database["public"]["Enums"]["copropiedad_uso_t"]
            | null
          zona_horaria?: string
        }
        Update: {
          agente_retencion?: boolean
          canal_notificacion?: string | null
          ciudad?: string | null
          compositor_correo_activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          dia_facturacion?: number | null
          direccion?: string | null
          email?: string | null
          explota_bienes_comunes?: boolean
          id?: string
          iva_periodicidad_id?: number | null
          logo_path?: string | null
          logo_storage_path?: string | null
          marco_clasificado_at?: string | null
          marco_clasificado_por?: string | null
          marco_fundamento?: string | null
          marco_grupo?:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          moneda?: string
          name?: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          responsable_iva?: boolean
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tiene_revisor_fiscal?: boolean | null
          tipo_division_id?: number
          updated_at?: string | null
          uso_economico?:
            | Database["public"]["Enums"]["copropiedad_uso_t"]
            | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_iva_periodicidad_id_fkey"
            columns: ["iva_periodicidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_marco_clasificado_por_fkey"
            columns: ["marco_clasificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_tipo_division_id_fkey"
            columns: ["tipo_division_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      tercero_perfil: {
        Row: {
          categoria_comercio_id: number | null
          categorias_servicio: number[]
          contacto_publico: string | null
          created_at: string
          descripcion: string | null
          especialidades: string[]
          estado_comercial_id: number | null
          horario: string | null
          id: string
          nombre_comercial: string | null
          publicado: boolean
          publicado_at: string | null
          publicado_por: string | null
          tenant_id: string
          tercero_id: string
          updated_at: string | null
        }
        Insert: {
          categoria_comercio_id?: number | null
          categorias_servicio?: number[]
          contacto_publico?: string | null
          created_at?: string
          descripcion?: string | null
          especialidades?: string[]
          estado_comercial_id?: number | null
          horario?: string | null
          id?: string
          nombre_comercial?: string | null
          publicado?: boolean
          publicado_at?: string | null
          publicado_por?: string | null
          tenant_id: string
          tercero_id: string
          updated_at?: string | null
        }
        Update: {
          categoria_comercio_id?: number | null
          categorias_servicio?: number[]
          contacto_publico?: string | null
          created_at?: string
          descripcion?: string | null
          especialidades?: string[]
          estado_comercial_id?: number | null
          horario?: string | null
          id?: string
          nombre_comercial?: string | null
          publicado?: boolean
          publicado_at?: string | null
          publicado_por?: string | null
          tenant_id?: string
          tercero_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_proveedor_perfil_estado_comercial_id_fkey"
            columns: ["estado_comercial_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_proveedor_perfil_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tercero_perfil_categoria_comercio_id_fkey"
            columns: ["categoria_comercio_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tercero_perfil_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      terceros: {
        Row: {
          busqueda_tsv: unknown
          created_at: string
          digito_verificacion: string | null
          direccion: string | null
          direccion_verificada_at: string | null
          direccion_verificada_por: string | null
          email: string | null
          estado_id: number
          id: string
          municipio: string | null
          nombre_completo: string | null
          numero_documento: string
          pagador_id: string | null
          primer_apellido: string | null
          primer_nombre: string | null
          razon_social: string | null
          representante_legal_id: string | null
          segundo_apellido: string | null
          segundo_nombre: string | null
          telefono: string | null
          tenant_id: string
          tipo_identificacion_id: number
          tipo_persona: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          busqueda_tsv?: unknown
          created_at?: string
          digito_verificacion?: string | null
          direccion?: string | null
          direccion_verificada_at?: string | null
          direccion_verificada_por?: string | null
          email?: string | null
          estado_id: number
          id?: string
          municipio?: string | null
          nombre_completo?: string | null
          numero_documento: string
          pagador_id?: string | null
          primer_apellido?: string | null
          primer_nombre?: string | null
          razon_social?: string | null
          representante_legal_id?: string | null
          segundo_apellido?: string | null
          segundo_nombre?: string | null
          telefono?: string | null
          tenant_id: string
          tipo_identificacion_id: number
          tipo_persona: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          busqueda_tsv?: unknown
          created_at?: string
          digito_verificacion?: string | null
          direccion?: string | null
          direccion_verificada_at?: string | null
          direccion_verificada_por?: string | null
          email?: string | null
          estado_id?: number
          id?: string
          municipio?: string | null
          nombre_completo?: string | null
          numero_documento?: string
          pagador_id?: string | null
          primer_apellido?: string | null
          primer_nombre?: string | null
          razon_social?: string | null
          representante_legal_id?: string | null
          segundo_apellido?: string | null
          segundo_nombre?: string | null
          telefono?: string | null
          tenant_id?: string
          tipo_identificacion_id?: number
          tipo_persona?: Database["public"]["Enums"]["tercero_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terceros_direccion_verificada_por_fkey"
            columns: ["direccion_verificada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_pagador_id_fkey"
            columns: ["pagador_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_representante_legal_id_fkey"
            columns: ["representante_legal_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_tipo_identificacion_id_fkey"
            columns: ["tipo_identificacion_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      terceros_contacto_procedencia: {
        Row: {
          campo: string
          created_at: string
          descripcion: string | null
          documento_id: string | null
          id: string
          origen_id: number
          registrado_por: string
          tenant_id: string
          tercero_id: string
          valor: string
        }
        Insert: {
          campo: string
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          id?: string
          origen_id: number
          registrado_por: string
          tenant_id: string
          tercero_id: string
          valor: string
        }
        Update: {
          campo?: string
          created_at?: string
          descripcion?: string | null
          documento_id?: string | null
          id?: string
          origen_id?: number
          registrado_por?: string
          tenant_id?: string
          tercero_id?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "terceros_contacto_procedencia_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "v_documento_vigente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terceros_contacto_procedencia_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          id: number
          nombre: string
          updated_at: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre: string
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: never
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tributario_concepto_retencion: {
        Row: {
          base_minima_uvt: number | null
          codigo: string
          created_at: string
          cuenta_contable_id: string
          id: number
          nombre: string
          tarifa: number
          tenant_id: string
          updated_at: string | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          base_minima_uvt?: number | null
          codigo: string
          created_at?: string
          cuenta_contable_id: string
          id?: never
          nombre: string
          tarifa: number
          tenant_id: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          base_minima_uvt?: number | null
          codigo?: string
          created_at?: string
          cuenta_contable_id?: string
          id?: never
          nombre?: string
          tarifa?: number
          tenant_id?: string
          updated_at?: string | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tributario_concepto_retencion_cuenta_contable_id_fkey"
            columns: ["cuenta_contable_id"]
            isOneToOne: false
            referencedRelation: "contable_cuenta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_concepto_retencion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_concepto_retencion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tributario_iva_generado: {
        Row: {
          base: number
          created_at: string
          fecha: string
          id: string
          periodo_id: string
          presupuesto_ejecucion_id: string | null
          registrado_por: string | null
          tarifa: number
          tenant_id: string
          tercero_id: string | null
          valor: number
        }
        Insert: {
          base: number
          created_at?: string
          fecha: string
          id?: string
          periodo_id: string
          presupuesto_ejecucion_id?: string | null
          registrado_por?: string | null
          tarifa: number
          tenant_id: string
          tercero_id?: string | null
          valor: number
        }
        Update: {
          base?: number
          created_at?: string
          fecha?: string
          id?: string
          periodo_id?: string
          presupuesto_ejecucion_id?: string | null
          registrado_por?: string | null
          tarifa?: number
          tenant_id?: string
          tercero_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "tributario_iva_generado_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_iva_generado_presupuesto_ejecucion_id_fkey"
            columns: ["presupuesto_ejecucion_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_ejecucion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_iva_generado_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_iva_generado_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_iva_generado_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tributario_iva_generado_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_permiso: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["permiso_vehiculo_estado_t"]
          id: string
          inmueble_id: string | null
          motivo: string | null
          motivo_revocacion: string | null
          otorgado_por: string | null
          revocado_at: string | null
          revocado_por: string | null
          tenant_id: string
          tipo_id: number
          vehiculo_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["permiso_vehiculo_estado_t"]
          id?: string
          inmueble_id?: string | null
          motivo?: string | null
          motivo_revocacion?: string | null
          otorgado_por?: string | null
          revocado_at?: string | null
          revocado_por?: string | null
          tenant_id: string
          tipo_id: number
          vehiculo_id: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["permiso_vehiculo_estado_t"]
          id?: string
          inmueble_id?: string | null
          motivo?: string | null
          motivo_revocacion?: string | null
          otorgado_por?: string | null
          revocado_at?: string | null
          revocado_por?: string | null
          tenant_id?: string
          tipo_id?: number
          vehiculo_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_permiso_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_otorgado_por_fkey"
            columns: ["otorgado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_revocado_por_fkey"
            columns: ["revocado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_permiso_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_relacion: {
        Row: {
          created_at: string
          id: string
          inmueble_id: string | null
          rol_id: number
          tenant_id: string
          tercero_id: string | null
          vehiculo_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inmueble_id?: string | null
          rol_id: number
          tenant_id: string
          tercero_id?: string | null
          vehiculo_id: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inmueble_id?: string | null
          rol_id?: number
          tenant_id?: string
          tercero_id?: string | null
          vehiculo_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_relacion_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_relacion_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          anio: number | null
          color: string | null
          creado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["vehiculo_estado_t"]
          id: string
          marca: string | null
          modelo: string | null
          motivo_retiro: string | null
          observaciones: string | null
          placa: string
          placa_normalizada: string | null
          retirado_at: string | null
          servicio_id: number | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          anio?: number | null
          color?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["vehiculo_estado_t"]
          id?: string
          marca?: string | null
          modelo?: string | null
          motivo_retiro?: string | null
          observaciones?: string | null
          placa: string
          placa_normalizada?: string | null
          retirado_at?: string | null
          servicio_id?: number | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          anio?: number | null
          color?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["vehiculo_estado_t"]
          id?: string
          marca?: string | null
          modelo?: string | null
          motivo_retiro?: string | null
          observaciones?: string | null
          placa?: string
          placa_normalizada?: string | null
          retirado_at?: string | null
          servicio_id?: number | null
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas_comunes: {
        Row: {
          activa: boolean
          area: number | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          descripcion: string | null
          es_esencial: boolean
          id: string
          matricula_inmobiliaria: string | null
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_exclusivo_inmueble_id: string | null
        }
        Insert: {
          activa?: boolean
          area?: number | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          descripcion?: string | null
          es_esencial?: boolean
          id?: string
          matricula_inmobiliaria?: string | null
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Update: {
          activa?: boolean
          area?: number | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          descripcion?: string | null
          es_esencial?: boolean
          id?: string
          matricula_inmobiliaria?: string | null
          nombre?: string
          tenant_id?: string
          tipo_id?: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zonas_comunes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_uso_exclusivo_inmueble_id_fkey"
            columns: ["uso_exclusivo_inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_comunes_uso_exclusivo_inmueble_id_fkey"
            columns: ["uso_exclusivo_inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mant_registros_acceso_resumen: {
        Row: {
          autorizacion_id: string | null
          egreso_at: string | null
          id: string | null
          ingreso_at: string | null
          inmueble_destino_id: string | null
          observaciones: string | null
          registrado_por: string | null
          tenant_id: string | null
          visitante_nombre: string | null
        }
        Insert: {
          autorizacion_id?: string | null
          egreso_at?: string | null
          id?: string | null
          ingreso_at?: string | null
          inmueble_destino_id?: string | null
          observaciones?: string | null
          registrado_por?: string | null
          tenant_id?: string | null
          visitante_nombre?: string | null
        }
        Update: {
          autorizacion_id?: string | null
          egreso_at?: string | null
          id?: string | null
          ingreso_at?: string | null
          inmueble_destino_id?: string | null
          observaciones?: string | null
          registrado_por?: string | null
          tenant_id?: string | null
          visitante_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mant_registros_acceso_autorizacion_id_fkey"
            columns: ["autorizacion_id"]
            isOneToOne: false
            referencedRelation: "mant_autorizaciones_visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_inmueble_destino_id_fkey"
            columns: ["inmueble_destino_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_inmueble_destino_id_fkey"
            columns: ["inmueble_destino_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mant_registros_acceso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tenant_overview: {
        Row: {
          created_at: string | null
          id: string | null
          last_activity_at: string | null
          member_count: number | null
          name: string | null
          slug: string | null
          status: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          member_count?: never
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status_t"] | null
        }
        Relationships: []
      }
      v_cargo_saldo: {
        Row: {
          cargo_capital_origen_id: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id: string | null
          created_at: string | null
          fecha_vencimiento: string | null
          id: string | null
          inmueble_id: string | null
          liquidacion_linea_id: string | null
          monto_original: number | null
          monto_pendiente: number | null
          novedad_id: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id: string | null
          tenant_id: string | null
        }
        Insert: {
          cargo_capital_origen_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id?: string | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          inmueble_id?: string | null
          liquidacion_linea_id?: string | null
          monto_original?: number | null
          monto_pendiente?: never
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          cargo_capital_origen_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"] | null
          concepto_id?: string | null
          created_at?: string | null
          fecha_vencimiento?: string | null
          id?: string | null
          inmueble_id?: string | null
          liquidacion_linea_id?: string | null
          monto_original?: number | null
          monto_pendiente?: never
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"] | null
          periodo_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_cargo_capital_origen_id_fkey"
            columns: ["cargo_capital_origen_id"]
            isOneToOne: false
            referencedRelation: "v_cargo_saldo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_liquidacion_linea_id_fkey"
            columns: ["liquidacion_linea_id"]
            isOneToOne: false
            referencedRelation: "liquidacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_novedad_id_fkey"
            columns: ["novedad_id"]
            isOneToOne: false
            referencedRelation: "novedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_documento_vigente: {
        Row: {
          busqueda_tsv: unknown
          caso_juridico_id: string | null
          created_at: string | null
          descripcion: string | null
          envio_id: string | null
          fecha_vencimiento: string | null
          grupo_id: string | null
          id: string | null
          inmueble_id: string | null
          nombre_archivo: string | null
          pago_id: string | null
          storage_path: string | null
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string | null
          tipo_documento_id: number | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_caso_juridico_id_fkey"
            columns: ["caso_juridico_id"]
            isOneToOne: false
            referencedRelation: "casos_juridicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "acciones_cobranza_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "inmuebles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_id_fkey"
            columns: ["inmueble_id"]
            isOneToOne: false
            referencedRelation: "v_inmuebles_sin_titular"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_inmueble_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tipo_documento_id_fkey"
            columns: ["tipo_documento_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inmuebles_sin_titular: {
        Row: {
          area_comun: number | null
          area_privada: number | null
          codigo: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id: number | null
          estado_legal_observaciones: string | null
          habitabilidad_id: number | null
          id: string | null
          matricula_inmobiliaria: string | null
          tenant_id: string | null
          tipo_id: number | null
          updated_at: string | null
        }
        Insert: {
          area_comun?: number | null
          area_privada?: number | null
          codigo?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string | null
          matricula_inmobiliaria?: string | null
          tenant_id?: string | null
          tipo_id?: number | null
          updated_at?: string | null
        }
        Update: {
          area_comun?: number | null
          area_privada?: number | null
          codigo?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["inmueble_estado_t"] | null
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string | null
          matricula_inmobiliaria?: string | null
          tenant_id?: string | null
          tipo_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inmuebles_estado_legal_id_fkey"
            columns: ["estado_legal_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_habitabilidad_id_fkey"
            columns: ["habitabilidad_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inmuebles_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          out_role: Database["public"]["Enums"]["tenant_role_t"]
          out_tenant_id: string
        }[]
      }
      admin_actualizar_perfil_miembro: {
        Args: {
          p_actor_id: string
          p_full_name: string
          p_membership_id: string
          p_phone: string
          p_status: Database["public"]["Enums"]["user_status_t"]
        }
        Returns: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          navigation_shortcuts: Json
          phone: string | null
          status: Database["public"]["Enums"]["user_status_t"]
          tenant_predeterminado_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agrupacion_subarbol: {
        Args: { p_agrupacion_id: string }
        Returns: {
          id: string
        }[]
      }
      auditoria_control_ejecutar: {
        Args: { p_control_id: string; p_engagement_id: string }
        Returns: {
          conteo: number
          ejecucion_id: string
          hallazgo_id: string
          resultado: string
        }[]
      }
      auditoria_ejecutar_controles_automaticos_diario: {
        Args: never
        Returns: undefined
      }
      cartera_etapa_requiere_aprobacion: {
        Args: {
          p_desde: Database["public"]["Enums"]["etapa_cobranza_t"]
          p_hacia: Database["public"]["Enums"]["etapa_cobranza_t"]
        }
        Returns: boolean
      }
      cartera_etapa_transicion_valida: {
        Args: {
          p_desde: Database["public"]["Enums"]["etapa_cobranza_t"]
          p_hacia: Database["public"]["Enums"]["etapa_cobranza_t"]
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window: string }
        Returns: boolean
      }
      contable_balance_prueba: {
        Args: {
          p_desde: string
          p_hasta: string
          p_nivel?: number
          p_tenant_id: string
        }
        Returns: {
          codigo: string
          creditos_periodo: number
          debitos_periodo: number
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          nombre: string
          saldo_anterior: number
          saldo_final: number
        }[]
      }
      contable_calcular_deterioro: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          ajuste: number
          cuenta_cartera_id: string
          cuenta_codigo: string
          cuenta_nombre: string
          deterioro_calculado: number
          deterioro_reconocido: number
          dias_vencido: number
          inmueble_id: string
          porcentaje: number
          saldo: number
          tramo_id: string
        }[]
      }
      contable_conciliacion_cartera: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          diferencia: number
          inmueble_id: string
          saldo_auxiliar: number
          saldo_contable: number
        }[]
      }
      contable_conciliacion_proyeccion: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          credito_persistido: number
          credito_proyeccion: number
          cuenta_codigo: string
          debito_persistido: number
          debito_proyeccion: number
          diferencia_credito: number
          diferencia_debito: number
        }[]
      }
      contable_cuadre: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          diferencia: number
          lineas: number
          sin_cuenta: number
          total_credito: number
          total_debito: number
        }[]
      }
      contable_dimensiones_faltantes: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          cuenta_codigo: string
          cuenta_nombre: string
          dimension_faltante: string
          entidad: string
          fecha: string
          origen: string
          origen_id: string
        }[]
      }
      contable_documentos_proximos_vencer_retencion: {
        Args: { p_dias_anticipacion?: number; p_tenant_id: string }
        Returns: {
          bajo_legal_hold: boolean
          dias_restantes: number
          documento_id: string
          fecha_limite: string
          fecha_origen: string
          tipo_documento: string
        }[]
      }
      contable_estado_financiero: {
        Args: {
          p_codigo_estado: string
          p_comparativo?: boolean
          p_fecha_corte: string
          p_tenant_id: string
        }
        Returns: {
          codigo: string
          etiqueta: string
          nivel: number
          nota_referencia: number
          orden: number
          tipo_linea: string
          valor: number
          valor_anterior: number
          variacion_absoluta: number
          variacion_relativa: number
        }[]
      }
      contable_hechos: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          agrupacion_id: string
          centro_costo_id: number
          cuenta_credito: string
          cuenta_debito: string
          descripcion: string
          documento: string
          entidad: string
          fecha: string
          fondo_id: string
          inmueble_id: string
          monto: number
          origen: string
          origen_id: string
          tercero_id: string
        }[]
      }
      contable_ingresos_por_naturaleza_tributaria: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          naturaleza_tributaria: string
          total: number
        }[]
      }
      contable_libro_diario: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          agrupacion_id: string
          centro_costo_id: number
          comprobante: string
          comprobante_id: string
          credito: number
          cuenta_codigo: string
          cuenta_nombre: string
          debito: number
          descripcion: string
          fecha: string
          fondo_id: string
          inmueble_id: string
          numero: number
          tercero_id: string
          tipo_codigo: string
        }[]
      }
      contable_libro_inventarios_balances: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          clase: number
          codigo: string
          cuadra: boolean
          diferencia: number
          nombre: string
          saldo: number
        }[]
      }
      contable_libro_mayor: {
        Args: {
          p_cuenta_id?: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          cuenta_codigo: string
          cuenta_id: string
          cuenta_nombre: string
          movimiento_credito: number
          movimiento_debito: number
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          saldo_final: number
          saldo_inicial: number
        }[]
      }
      contable_movimientos: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          agrupacion_id: string
          centro_costo_id: number
          credito: number
          cuenta_codigo: string
          cuenta_nombre: string
          debito: number
          descripcion: string
          documento: string
          entidad: string
          fecha: string
          fondo_id: string
          inmueble_id: string
          origen: string
          origen_id: string
          tercero_id: string
        }[]
      }
      contable_parametrizacion_pendiente: {
        Args: { p_tenant_id: string }
        Returns: {
          ambito: string
          detalle: string
          referencia: string
        }[]
      }
      contable_resultado_ejercicio: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: number
      }
      contable_validacion_cierre: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: {
          detalle: string
          hallazgo: string
          severidad: string
        }[]
      }
      contable_validar_notas_completas: {
        Args: { p_ejercicio: number; p_tenant_id: string }
        Returns: undefined
      }
      create_tenant: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          agente_retencion: boolean
          canal_notificacion: string | null
          ciudad: string | null
          compositor_correo_activo: boolean
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          dia_facturacion: number | null
          direccion: string | null
          email: string | null
          explota_bienes_comunes: boolean
          id: string
          iva_periodicidad_id: number | null
          logo_path: string | null
          logo_storage_path: string | null
          marco_clasificado_at: string | null
          marco_clasificado_por: string | null
          marco_fundamento: string | null
          marco_grupo:
            | Database["public"]["Enums"]["marco_contable_grupo_t"]
            | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          responsable_iva: boolean
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tiene_revisor_fiscal: boolean | null
          tipo_division_id: number
          updated_at: string | null
          uso_economico: Database["public"]["Enums"]["copropiedad_uso_t"] | null
          zona_horaria: string
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cron_anuncios_publicar_programados: { Args: never; Returns: undefined }
      cron_cartera_recalcular_diario: { Args: never; Returns: undefined }
      cron_finanzas_flujo_alertas_diario: { Args: never; Returns: undefined }
      cron_gobierno_vencimientos_diario: { Args: never; Returns: undefined }
      cron_mant_generar_programaciones_diario: {
        Args: never
        Returns: undefined
      }
      cron_mant_inventario_alertas_diario: { Args: never; Returns: undefined }
      cron_mant_salud_snapshot_mensual: { Args: never; Returns: undefined }
      current_tenant_id: { Args: never; Returns: string }
      finanzas_alertas_evaluar: {
        Args: { p_fecha?: string; p_tenant_id: string }
        Returns: number
      }
      finanzas_factura_descomposicion: {
        Args: { p_ejecucion_id: string }
        Returns: {
          credito: number
          cuenta_id: string
          debito: number
          descripcion: string
        }[]
      }
      finanzas_facturas_pagables: {
        Args: {
          p_hasta: string
          p_solo_vencidas?: boolean
          p_tenant_id: string
        }
        Returns: {
          contrato_id: string
          dias_vencido: number
          factura_id: string
          fecha_emision: string
          fecha_vencimiento: string
          numero_documento: string
          proveedor_nombre: string
          total_neto_pagar: number
          ya_en_lote: boolean
        }[]
      }
      finanzas_flujo_proyectado: {
        Args: {
          p_escenario?: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          p_fecha_calculo?: string
          p_horizonte_dias: number
          p_tenant_id: string
        }
        Returns: {
          componentes_insuficientes: string[]
          egresos_contratos: number
          egresos_cxp: number
          egresos_mantenimiento: number
          flujo_neto: number
          ingresos_esperados: number
          ingresos_otros: number
          saldo_acumulado: number
          semana: number
        }[]
      }
      finanzas_flujo_snapshot_guardar: {
        Args: {
          p_escenario: Database["public"]["Enums"]["finanzas_flujo_escenario_t"]
          p_horizonte_dias: number
          p_motivo: string
          p_tenant_id: string
        }
        Returns: string
      }
      finanzas_posicion_tesoreria: {
        Args: { p_fecha?: string; p_tenant_id: string }
        Returns: {
          concepto: string
          detalle_id: string
          detalle_nombre: string
          monto_comprometido: number
          monto_disponible: number
          monto_total: number
          naturaleza: Database["public"]["Enums"]["posicion_naturaleza_t"]
          utilizable: boolean
        }[]
      }
      finanzas_proyeccion_vs_real: {
        Args: { p_hasta: string; p_snapshot_id: string }
        Returns: {
          desviacion: number
          flujo_neto_proyectado: number
          flujo_neto_real: number
          semana: number
        }[]
      }
      finanzas_tasa_recaudo_historica: {
        Args: { p_fecha?: string; p_meses?: number; p_tenant_id: string }
        Returns: number
      }
      fn_acreditacion_accion: {
        Args: { p_accion_id: string; p_tenant_id: string }
        Returns: {
          acreditada: boolean
          envios_acreditados: number
          envios_total: number
          ultimo_acuse_at: string
          ultimo_estado: Database["public"]["Enums"]["estado_acuse_t"]
        }[]
      }
      fn_activar_legal_hold: {
        Args: {
          p_caso_id?: string
          p_documento_grupo_id: string
          p_motivo: string
          p_tenant_id: string
        }
        Returns: {
          activo: boolean
          actualizado_por: string | null
          caso_id: string | null
          creado_por: string
          created_at: string
          documento_grupo_id: string
          id: string
          motivo: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "documentos_legal_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_activar_pasarela: {
        Args: { p_config_id: string; p_tenant_id: string }
        Returns: {
          activa: boolean
          created_at: string
          id: string
          identificador_publico: string | null
          modo: Database["public"]["Enums"]["pasarela_modo_t"]
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          tenant_id: string
          updated_at: string | null
          verificada_at: string | null
          webhook_token: string
        }
        SetofOptions: {
          from: "*"
          to: "pasarela_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_actividad_reciente_cartera: {
        Args: { p_limite?: number; p_tenant_id: string }
        Returns: {
          codigo: string
          fecha: string
          inmueble_id: string
          monto: number
          tipo: string
        }[]
      }
      fn_actor_externo_confirmar_otp: {
        Args: { p_canal: string; p_codigo: string; p_contacto: string }
        Returns: {
          email: string
          nombre_completo: string
          persona_rol_id: string
          rol_codigo: string
          telefono: string
          tenant_id: string
          tercero_id: string
        }[]
      }
      fn_actor_externo_mis_vinculos: {
        Args: { p_auth_user_id: string }
        Returns: {
          inmueble_id: string
          persona_tipo: Database["public"]["Enums"]["actor_externo_persona_t"]
          rol_codigo: string
          tenant_id: string
          tenant_nombre: string
          vigente_desde: string
          vigente_hasta: string
          vinculo_id: string
        }[]
      }
      fn_actor_externo_paso_reforzado_confirmar: {
        Args: {
          p_accion: string
          p_auth_user_id: string
          p_codigo: string
          p_contexto_id: string
        }
        Returns: boolean
      }
      fn_actor_externo_paso_reforzado_solicitar: {
        Args: {
          p_accion: string
          p_auth_user_id: string
          p_contexto_id: string
        }
        Returns: string
      }
      fn_actor_externo_registrar_vinculo: {
        Args: {
          p_auth_user_id: string
          p_creado_por?: string
          p_origen: Database["public"]["Enums"]["actor_externo_origen_t"]
          p_persona_rol_id: string
          p_persona_tipo: Database["public"]["Enums"]["actor_externo_persona_t"]
          p_tenant_id: string
        }
        Returns: {
          auth_user_id: string
          creado_at: string
          creado_por: string | null
          id: string
          origen: Database["public"]["Enums"]["actor_externo_origen_t"]
          persona_rol_id: string
          persona_tipo: Database["public"]["Enums"]["actor_externo_persona_t"]
          tenant_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "actor_externo_vinculo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_actor_externo_solicitar_otp: {
        Args: { p_canal: string; p_contacto: string }
        Returns: string
      }
      fn_alertas_cartera: {
        Args: { p_fecha_referencia: string; p_tenant_id: string }
        Returns: {
          cuotas_acuerdo_vencidas_cantidad: number
          cuotas_acuerdo_vencidas_monto: number
          obligaciones_mayor_90_cantidad: number
          obligaciones_mayor_90_monto: number
          obligaciones_sin_vencimiento_cantidad: number
          obligaciones_sin_vencimiento_monto: number
          promesas_por_vencer_cantidad: number
          promesas_por_vencer_monto: number
        }[]
      }
      fn_anular_liquidacion: {
        Args: { p_liquidacion_id: string; p_motivo: string }
        Returns: Json
      }
      fn_anular_pago: {
        Args: { p_actor_id: string; p_motivo: string; p_pago_id: string }
        Returns: string
      }
      fn_anuncio_destinatarios: {
        Args: { p_anuncio_id: string }
        Returns: {
          email: string
          nombre: string
          telefono: string
          tercero_id: string
        }[]
      }
      fn_anuncio_metricas: {
        Args: { p_anuncio_id: string }
        Returns: {
          confirmados: number
          destinatarios: number
          leidos: number
        }[]
      }
      fn_anuncio_publicar_programados: { Args: never; Returns: number }
      fn_anuncio_siguiente_numero: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_aplicar_anticipos: {
        Args: { p_inmueble_id: string; p_tenant_id: string }
        Returns: number
      }
      fn_aplicar_aporte_fondo: {
        Args: { p_pago_aplicacion_id: string }
        Returns: number
      }
      fn_aplicar_descuento_pronto_pago: {
        Args: { p_pago_id: string }
        Returns: number
      }
      fn_aplicar_liquidacion: {
        Args: {
          p_avisos_alcance?: Json
          p_liquidacion_id: string
          p_snapshot_hash?: string
        }
        Returns: Json
      }
      fn_aprobar_novedad: {
        Args: { p_actor_id: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_motivo: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_autorizacion_visita_marcar_usada: {
        Args: {
          p_autorizacion_id: string
          p_observaciones?: string
          p_registrado_por: string
        }
        Returns: {
          autorizacion_id: string | null
          egreso_at: string | null
          id: string
          ingreso_at: string
          inmueble_destino_id: string
          observaciones: string | null
          registrado_por: string
          tenant_id: string
          visitante_documento: string | null
          visitante_nombre: string
        }
        SetofOptions: {
          from: "*"
          to: "mant_registros_acceso"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_autorizacion_visita_mis_autorizaciones_externas: {
        Args: { p_vinculo_id: string }
        Returns: {
          created_at: string
          egreso_at: string
          estado: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista: string
          hora_desde: string
          hora_hasta: string
          id: string
          ingreso_at: string
          qr_expira_at: string
          qr_token: string
          tipo_id: number
          visitante_documento: string
          visitante_nombre: string
        }[]
      }
      fn_autorizacion_visita_revocar: {
        Args: { p_autorizacion_id: string }
        Returns: {
          autorizado_por_origen: Database["public"]["Enums"]["autorizacion_origen_t"]
          autorizado_por_ref: string
          created_at: string
          estado: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista: string
          hora_desde: string | null
          hora_hasta: string | null
          id: string
          inmueble_id: string
          qr_expira_at: string | null
          qr_token: string | null
          tenant_id: string
          tipo_id: number | null
          vehiculo_placa: string | null
          vehiculo_placa_normalizada: string | null
          visitante_documento: string | null
          visitante_nombre: string
        }
        SetofOptions: {
          from: "*"
          to: "mant_autorizaciones_visita"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_autorizacion_visita_revocar_externa: {
        Args: { p_autorizacion_id: string; p_vinculo_id: string }
        Returns: {
          autorizado_por_origen: Database["public"]["Enums"]["autorizacion_origen_t"]
          autorizado_por_ref: string
          created_at: string
          estado: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          fecha_prevista: string
          hora_desde: string | null
          hora_hasta: string | null
          id: string
          inmueble_id: string
          qr_expira_at: string | null
          qr_token: string | null
          tenant_id: string
          tipo_id: number | null
          vehiculo_placa: string | null
          vehiculo_placa_normalizada: string | null
          visitante_documento: string | null
          visitante_nombre: string
        }
        SetofOptions: {
          from: "*"
          to: "mant_autorizaciones_visita"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_bandeja_cobranza: {
        Args: {
          p_estados?: Database["public"]["Enums"]["estado_accion_cobranza_t"][]
          p_limite?: number
          p_tenant_id: string
        }
        Returns: {
          accion_id: string
          acreditada: boolean
          aprobada_at: string
          aprobada_por: string
          canal: Database["public"]["Enums"]["canal_cobranza_t"]
          clasificacion_codigo: string
          creada_por: Database["public"]["Enums"]["origen_accion_cobranza_t"]
          destinatario_contacto: string
          destinatario_id: string
          destinatario_nombre: string
          destinatario_rol: string
          deuda_total: number
          dias_mora: number
          envios_total: number
          estado: Database["public"]["Enums"]["estado_accion_cobranza_t"]
          fecha_ejecucion: string
          fecha_programada: string
          grupo_envio_id: string
          inmueble_codigo: string
          inmueble_id: string
          notas: string
          propuesta_por: string
          tipo_accion: Database["public"]["Enums"]["tipo_accion_cobranza_t"]
          ultimo_estado_acuse: Database["public"]["Enums"]["estado_acuse_t"]
        }[]
      }
      fn_bandeja_escalamiento: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          cantidad_cargos_vencidos: number
          deuda_total: number
          dias_mora: number
          etapa: Database["public"]["Enums"]["etapa_cobranza_t"]
          etapa_propuesta: Database["public"]["Enums"]["etapa_cobranza_t"]
          inmueble_codigo: string
          inmueble_id: string
          motivo_propuesta: string
          propuesto_at: string
          propuesto_por: string
        }[]
      }
      fn_buscar_global: {
        Args: {
          p_categoria?: string
          p_limite?: number
          p_query: string
          p_tenant_id: string
        }
        Returns: {
          categoria: string
          entidad_id: string
          inmueble_id: string
          rank: number
          subtitulo: string
          titulo: string
        }[]
      }
      fn_calcular_dv_nit: { Args: { p_nit: string }; Returns: string }
      fn_cambiar_modo_pasarela: {
        Args: {
          p_config_id: string
          p_modo: Database["public"]["Enums"]["pasarela_modo_t"]
          p_tenant_id: string
        }
        Returns: {
          activa: boolean
          created_at: string
          id: string
          identificador_publico: string | null
          modo: Database["public"]["Enums"]["pasarela_modo_t"]
          proveedor: Database["public"]["Enums"]["pasarela_proveedor_t"]
          tenant_id: string
          updated_at: string | null
          verificada_at: string | null
          webhook_token: string
        }
        SetofOptions: {
          from: "*"
          to: "pasarela_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cerrar_rol_anterior: {
        Args: {
          p_inmueble_id: string
          p_persona_rol_id: string
          p_rol_id: number
          p_tenant_id: string
          p_vigente_desde: string
        }
        Returns: undefined
      }
      fn_cerrar_rol_anterior_tenant: {
        Args: {
          p_rol_id: number
          p_tenant_id: string
          p_tenant_tercero_rol_id: string
          p_vigente_desde: string
        }
        Returns: undefined
      }
      fn_coeficiente_set_vigente: {
        Args: { p_fecha: string; p_tenant_id: string }
        Returns: string
      }
      fn_compilar_expediente: {
        Args: {
          p_fecha_corte: string
          p_inmueble_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_contabilizar_comprobante: {
        Args: { p_comprobante_id: string }
        Returns: string
      }
      fn_contabilizar_periodo: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: {
          categoria: string
          comprobante_id: string
          detalle: string
          hecho_entidad: string
          hecho_id: string
        }[]
      }
      fn_contable_abrir_ejercicio: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: string
      }
      fn_contable_aprobar_rendicion: {
        Args: { p_id: string }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_cerrar_ejercicio: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: string
      }
      fn_contable_cerrar_periodo: {
        Args: {
          p_forzar_advertencias?: boolean
          p_periodo_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      fn_contable_certificar_estados: {
        Args: {
          p_administrador_documento: string
          p_contador_tarjeta_profesional?: string
          p_contador_tercero_id?: string
          p_ejercicio: number
          p_estados_incluidos: string[]
          p_fecha_corte: string
          p_tenant_id: string
          p_texto_certificacion: string
        }
        Returns: {
          administrador_documento: string | null
          administrador_nombre: string
          certificado_at: string
          certificado_por: string
          contador_nombre: string | null
          contador_tarjeta_profesional: string | null
          contador_tercero_id: string | null
          documento_id: string | null
          ejercicio: number
          estados_incluidos: string[]
          fecha_corte: string
          hash_contenido: string
          id: string
          invalidada: boolean
          invalidada_at: string | null
          invalidada_motivo: string | null
          tenant_id: string
          texto_certificacion: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_certificacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_corregir_error: {
        Args: {
          p_comprobante_correcto_id: string
          p_comprobante_origen_id: string
          p_motivo: string
          p_periodo_destino: string
          p_tenant_id: string
          p_tipo_correccion: string
        }
        Returns: string
      }
      fn_contable_crear_rendicion: {
        Args: {
          p_certificacion_id: string
          p_dictamen_id?: string
          p_ejercicio: number
          p_periodo_desde: string
          p_periodo_hasta: string
          p_presupuesto_ejecutado_resumen?: Json
          p_tenant_id: string
        }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_invalidar_certificacion: {
        Args: { p_ejercicio: number; p_motivo: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_contable_presentar_rendicion: {
        Args: {
          p_acta_referencia_texto?: string
          p_decision_id?: string
          p_id: string
          p_observaciones?: string
        }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_reabrir_periodo: {
        Args: { p_motivo: string; p_periodo_id: string; p_tenant_id: string }
        Returns: string
      }
      fn_contable_rechazar_rendicion: {
        Args: { p_id: string; p_motivo: string }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_reconocer_deterioro: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: string
      }
      fn_contable_registrar_dictamen: {
        Args: {
          p_certificacion_id: string
          p_fecha: string
          p_revisor_fiscal_tercero_id: string
          p_tenant_id: string
          p_texto: string
          p_tipo_opinion_codigo: string
        }
        Returns: {
          certificacion_id: string
          created_at: string
          documento_id: string | null
          fecha: string
          id: string
          registrado_por: string | null
          revisor_fiscal_tercero_id: string
          tenant_id: string
          texto: string
          tipo_opinion_id: number
        }
        SetofOptions: {
          from: "*"
          to: "contable_dictamen"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_registrar_libros_dian: {
        Args: { p_fecha: string; p_id: string; p_radicado: string }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contable_siguiente_numero: {
        Args: { p_anio: number; p_tenant_id: string; p_tipo_id: number }
        Returns: number
      }
      fn_contable_vincular_documento_rendicion: {
        Args: { p_documento_id: string; p_id: string }
        Returns: {
          acta_referencia_texto: string | null
          aprobada_at: string | null
          certificacion_id: string
          creado_por: string | null
          created_at: string
          decision_id: string | null
          dictamen_id: string | null
          documento_id: string | null
          ejercicio: number
          estado: string
          id: string
          libros_dian_fecha: string | null
          libros_dian_radicado: string | null
          libros_dian_registrado: boolean
          observaciones: string | null
          periodo_desde: string
          periodo_hasta: string
          presentada_at: string | null
          presupuesto_ejecutado_resumen: Json | null
          reunion_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contable_rendicion_cuentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_contar_acciones_acreditadas: {
        Args: { p_inmueble_id: string; p_tenant_id: string }
        Returns: number
      }
      fn_crear_preliquidacion: {
        Args: {
          p_lineas: Json
          p_periodo_id: string
          p_result_hash: string
          p_snapshot?: Json
          p_snapshot_hash?: string
          p_tenant_id: string
          p_tenant_total: number
        }
        Returns: Json
      }
      fn_crear_version_politica_clasificacion: {
        Args: { p_politica_id: string }
        Returns: string
      }
      fn_credenciales_pasarela_descifrables: {
        Args: { p_config_id: string; p_tenant_id: string }
        Returns: number
      }
      fn_cuenta_bancaria_disponible: {
        Args: { p_cuenta_bancaria_id: string; p_fecha?: string }
        Returns: {
          comprometido_proyectado: number
          comprometido_reservado: number
          disponible: number
          saldo_contable: number
        }[]
      }
      fn_dashboard_cartera: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          codigo: string
          deuda_corriente: number
          deuda_sin_vencimiento: number
          deuda_total: number
          deuda_vencida: number
          dias_mora_maximo: number
          etapa_cobranza: string
          inmueble_id: string
          interes_causado: number
          saldo_credito: number
        }[]
      }
      fn_directorio_listar: {
        Args: { p_categoria?: number; p_tenant_id: string; p_texto?: string }
        Returns: {
          categoria_codigo: string
          categoria_nombre: string
          contacto_publico: string
          descripcion: string
          horario: string
          nombre_comercial: string
          tercero_id: string
          tipo_persona: Database["public"]["Enums"]["tercero_tipo_t"]
          ubicaciones: string[]
        }[]
      }
      fn_emitir_estados_cuenta: {
        Args: { p_liquidacion_id: string }
        Returns: number
      }
      fn_emitir_recibo_caja: { Args: { p_pago_id: string }; Returns: string }
      fn_evolucion_cartera_vencida: {
        Args: { p_fecha_hasta: string; p_meses?: number; p_tenant_id: string }
        Returns: {
          deuda_vencida: number
          fecha_snapshot: string
          mes: string
        }[]
      }
      fn_finanzas_anular_lote: {
        Args: { p_lote_id: string; p_motivo: string }
        Returns: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_pagos: number
          creado_por: string | null
          created_at: string
          cuenta_bancaria_id: string
          descripcion: string | null
          ejecutado_at: string | null
          ejecutado_por: string | null
          estado: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          fondo_id: string | null
          id: string
          justificacion: string | null
          monto_total: number
          numero: number
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_lotes_pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_aprobar_factura: {
        Args: { p_factura_id: string }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          centro_costo_id: number | null
          concepto_gasto: string | null
          contrato_id: string | null
          creado_por: string | null
          created_at: string
          documento_soporte_id: string | null
          estado: Database["public"]["Enums"]["factura_estado_t"]
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          iva_descontable: number
          iva_generado: number
          motivo_disputa: string | null
          motivo_rechazo: string | null
          numero_documento: string
          observaciones: string | null
          presupuesto_cuenta_id: string | null
          presupuesto_ejecucion_id: string | null
          proveedor_id: string
          subtotal: number
          tenant_id: string
          total_bruto: number
          total_neto_pagar: number
          total_retenciones: number
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_facturas_proveedor"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_aprobar_lote: {
        Args: { p_justificacion?: string; p_lote_id: string }
        Returns: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_pagos: number
          creado_por: string | null
          created_at: string
          cuenta_bancaria_id: string
          descripcion: string | null
          ejecutado_at: string | null
          ejecutado_por: string | null
          estado: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          fondo_id: string | null
          id: string
          justificacion: string | null
          monto_total: number
          numero: number
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_lotes_pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_conciliar_lote: {
        Args: { p_extracto_linea_id: string; p_lote_id: string }
        Returns: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_pagos: number
          creado_por: string | null
          created_at: string
          cuenta_bancaria_id: string
          descripcion: string | null
          ejecutado_at: string | null
          ejecutado_por: string | null
          estado: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          fondo_id: string | null
          id: string
          justificacion: string | null
          monto_total: number
          numero: number
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_lotes_pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_ejecutar_lote: {
        Args: { p_fecha_ejecucion?: string; p_lote_id: string }
        Returns: {
          anio: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_pagos: number
          creado_por: string | null
          created_at: string
          cuenta_bancaria_id: string
          descripcion: string | null
          ejecutado_at: string | null
          ejecutado_por: string | null
          estado: Database["public"]["Enums"]["lote_estado_t"]
          extracto_linea_id: string | null
          fecha_ejecucion: string | null
          fecha_programada: string
          fondo_id: string | null
          id: string
          justificacion: string | null
          monto_total: number
          numero: number
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_lotes_pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_lotes_pago_siguiente_numero: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_finanzas_politica_aprobacion_lote_vigente: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_politica_aprobacion_lote"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_finanzas_politica_aprobacion_vigente: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        SetofOptions: {
          from: "*"
          to: "finanzas_politica_aprobacion_pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_fondo_cerrar: {
        Args: {
          p_decision?: string
          p_destino?: string
          p_documento_id?: string
          p_fondo_destino_id?: string
          p_fondo_id: string
          p_organo_id?: number
        }
        Returns: {
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          destinacion: string | null
          documento_principal_id: string | null
          estado: Database["public"]["Enums"]["fondo_estado_t"]
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          meta: number | null
          naturaleza: Database["public"]["Enums"]["fondo_naturaleza_t"]
          nombre: string
          objetivo: string | null
          permanente: boolean
          saldo_actual: number
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fondos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_fondo_movimiento_efecto: {
        Args: {
          p_monto: number
          p_tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Returns: number
      }
      fn_fondo_reconciliar: {
        Args: { p_tenant_id: string }
        Returns: {
          codigo: string
          diferencia: number
          fondo_id: string
          nombre: string
          saldo_derivado: number
          saldo_materializado: number
        }[]
      }
      fn_fondo_saldo_derivado: { Args: { p_fondo_id: string }; Returns: number }
      fn_fondo_saldos: {
        Args: { p_fondo_id: string }
        Returns: {
          comprometido: number
          disponible: number
          saldo: number
        }[]
      }
      fn_generar_cargos_novedades_periodo: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: number
      }
      fn_generar_notas: {
        Args: { p_ejercicio: number; p_tenant_id: string }
        Returns: {
          cuerpo: string
          editada_at: string | null
          editada_por: string | null
          ejercicio: number
          estado: string
          generada_at: string
          id: string
          numero: number
          plantilla_id: string
          tenant_id: string
          titulo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contable_nota"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_gobierno_actualizar_narrativa: {
        Args: { p_acta_id: string; p_narrativa: string }
        Returns: {
          anio: number
          contenido_generado: Json
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido: string | null
          id: string
          incluye_voto_nominal: boolean
          narrativa: string | null
          numero: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at: string | null
          suscrita_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_actas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_gobierno_expensa_necesaria_mensual: {
        Args: { p_fecha: string; p_inmueble_id: string }
        Returns: number
      }
      fn_gobierno_politica_semaforo_vigente: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          dias_proximo_vencer: number
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          id: string
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_politica_semaforo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_gobierno_registrar_salida: {
        Args: { p_asistencia_id: string }
        Returns: {
          asistente_ref: string
          calidad: Database["public"]["Enums"]["asistencia_calidad_t"]
          coeficiente: number
          id: string
          ingreso_at: string
          inmueble_id: string | null
          modalidad_asistencia: string | null
          poder_id: string | null
          reunion_id: string
          salida_at: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_asistencia"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_gobierno_siguiente_numero_acta: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_gobierno_siguiente_numero_decision: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_gobierno_siguiente_numero_expediente: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_gobierno_siguiente_numero_impugnacion: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_gobierno_suscribir_acta: {
        Args: {
          p_acta_id: string
          p_presidente_miembro_id: string
          p_secretario_miembro_id: string
        }
        Returns: {
          anio: number
          contenido_generado: Json
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido: string | null
          id: string
          incluye_voto_nominal: boolean
          narrativa: string | null
          numero: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at: string | null
          suscrita_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_actas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_gobierno_vincular_documento_acta: {
        Args: { p_acta_id: string; p_documento_id: string }
        Returns: {
          anio: number
          contenido_generado: Json
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido: string | null
          id: string
          incluye_voto_nominal: boolean
          narrativa: string | null
          numero: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at: string | null
          suscrita_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_actas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_guardar_credencial_pasarela: {
        Args: {
          p_actor_id: string
          p_config_id: string
          p_nombre: string
          p_tenant_id: string
          p_valor: string
        }
        Returns: string
      }
      fn_guardar_plantilla_email: {
        Args: {
          p_event_type: string
          p_html_content: string
          p_subject: string
          p_tenant_id: string
        }
        Returns: {
          brevo_template_id: number | null
          created_at: string
          event_type: string
          html_content: string
          id: string
          is_synced: boolean
          last_synced_at: string | null
          subject: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "email_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_guardar_plantilla_sms: {
        Args: { p_cuerpo: string; p_event_type: string; p_tenant_id: string }
        Returns: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_indicadores_gestion: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_tenant_id: string
        }
        Returns: {
          acciones_efectivas: number
          acciones_ejecutadas: number
          acuerdos_cumplidos: number
          acuerdos_terminados: number
          monto_recuperado_periodo: number
          promesas_cumplidas: number
          promesas_vencidas: number
        }[]
      }
      fn_indicadores_legales: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_tenant_id: string
        }
        Returns: {
          cantidad_cargos_saldados: number
          costas_monto: number
          inmuebles_remitidos: number
          inmuebles_tramo_juridico: number
          monto_pretension_casos: number
          monto_recuperado_casos: number
          suma_dias_recuperacion: number
        }[]
      }
      fn_inhabilitar_novedad: {
        Args: { p_actor_id: string; p_motivo: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_motivo: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_instanciar_conceptos: {
        Args: { p_tenant_id: string }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_cuentas_default: {
        Args: { p_tenant_id: string }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_finanzas_flujo_default: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      fn_instanciar_fondo_imprevistos: {
        Args: { p_tenant_id: string }
        Returns: {
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          destinacion: string | null
          documento_principal_id: string | null
          estado: Database["public"]["Enums"]["fondo_estado_t"]
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          meta: number | null
          naturaleza: Database["public"]["Enums"]["fondo_naturaleza_t"]
          nombre: string
          objetivo: string | null
          permanente: boolean
          saldo_actual: number
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fondos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_instanciar_plan_contable: {
        Args: {
          p_incluir_opcionales?: boolean
          p_plan_codigo?: string
          p_tenant_id: string
        }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_presupuesto_cuenta: {
        Args: { p_tenant_id: string }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_puentes_presupuesto: {
        Args: { p_tenant_id: string }
        Returns: {
          mapeadas: number
          sin_mapear: number
        }[]
      }
      fn_instanciar_requisitos_cumplimiento: {
        Args: { p_tenant_id: string }
        Returns: {
          creadas: number
          existentes: number
        }[]
      }
      fn_instanciar_salud_factores_default: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      fn_leer_credenciales_pasarela: {
        Args: { p_config_id: string; p_tenant_id: string }
        Returns: {
          nombre: string
          valor: string
        }[]
      }
      fn_liberar_legal_hold: {
        Args: {
          p_documento_grupo_id: string
          p_motivo: string
          p_tenant_id: string
        }
        Returns: {
          activo: boolean
          actualizado_por: string | null
          caso_id: string | null
          creado_por: string
          created_at: string
          documento_grupo_id: string
          id: string
          motivo: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "documentos_legal_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_liquidacion_prevuelo: {
        Args: {
          p_liquidacion_id?: string
          p_periodo_id: string
          p_tenant_id: string
        }
        Returns: {
          codigo: string
          detalle: string
          severidad: string
          titulo: string
        }[]
      }
      fn_liquidacion_sello_datos: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: string
      }
      fn_mant_aceptar_hallazgo: {
        Args: { p_hallazgo_id: string; p_motivo: string; p_organo_id?: string }
        Returns: {
          aceptado_at: string | null
          aceptado_motivo: string | null
          aceptado_por: string | null
          cerrado_at: string | null
          cerrado_evidencia_documento_id: string | null
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string | null
          id: string
          inspeccion_id: string
          organo_aprobador_id: string | null
          ot_id: string | null
          severidad: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_hallazgos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_activar_plan: {
        Args: { p_plan_id: string }
        Returns: {
          activo: boolean
          alcance: Database["public"]["Enums"]["plan_alcance_t"]
          alcance_activo_id: string | null
          alcance_agrupacion_id: string | null
          alcance_categoria_id: number | null
          alcance_tipo_activo_id: number | null
          alcance_zona_comun_id: string | null
          codigo: string
          contrato_id: string | null
          created_at: string
          descripcion: string | null
          duracion_estimada_min: number | null
          encadenar_desde_ejecucion_real: boolean
          frecuencia_meses: number
          frecuencia_origen: Database["public"]["Enums"]["plan_frecuencia_origen_t"]
          horizonte_meses: number
          id: string
          nombre: string
          requiere_parada_servicio: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          updated_at: string | null
          ventana_dias: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_planes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_asignar_ot_hallazgo: {
        Args: { p_hallazgo_id: string; p_ot_id: string }
        Returns: {
          aceptado_at: string | null
          aceptado_motivo: string | null
          aceptado_por: string | null
          cerrado_at: string | null
          cerrado_evidencia_documento_id: string | null
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string | null
          id: string
          inspeccion_id: string
          organo_aprobador_id: string | null
          ot_id: string | null
          severidad: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_hallazgos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_capitalizar_activo: {
        Args: { p_activo_id: string; p_periodo_id: string; p_tenant_id: string }
        Returns: string
      }
      fn_mant_cerrar_hallazgo: {
        Args: { p_evidencia_documento_id?: string; p_hallazgo_id: string }
        Returns: {
          aceptado_at: string | null
          aceptado_motivo: string | null
          aceptado_por: string | null
          cerrado_at: string | null
          cerrado_evidencia_documento_id: string | null
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string | null
          id: string
          inspeccion_id: string
          organo_aprobador_id: string | null
          ot_id: string | null
          severidad: Database["public"]["Enums"]["severidad_t"]
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_hallazgos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_cerrar_ot: {
        Args: {
          p_aprobada_por?: string
          p_evidencia_referencia?: string
          p_fecha_cierre?: string
          p_ot_id: string
        }
        Returns: {
          acreditacion_referencia: string | null
          activo_id: string | null
          anio: number
          aprobada_at: string | null
          aprobada_por: string | null
          asignado_tercero_id: string | null
          asignado_usuario_id: string | null
          cancelada_motivo: string | null
          cerrada_at: string | null
          contrato_id: string | null
          costo_estimado: number | null
          created_at: string
          descripcion: string | null
          ejecutada_at: string | null
          estado: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite: string | null
          fecha_programada: string | null
          id: string
          incidencia_id: string | null
          iniciada_at: string | null
          inspeccion_id: string | null
          numero: number
          origen: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id: number | null
          programacion_id: string | null
          requiere_aprobacion: boolean
          requiere_parada_servicio: boolean
          requiere_trabajo_alturas: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          titulo: string
          updated_at: string | null
          ventana_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_ordenes_trabajo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_convertir_incidencia_a_ot: {
        Args: {
          p_asignado_tercero_id?: string
          p_asignado_usuario_id?: string
          p_incidencia_id: string
          p_tipo_mantenimiento_id: number
          p_titulo?: string
        }
        Returns: {
          acreditacion_referencia: string | null
          activo_id: string | null
          anio: number
          aprobada_at: string | null
          aprobada_por: string | null
          asignado_tercero_id: string | null
          asignado_usuario_id: string | null
          cancelada_motivo: string | null
          cerrada_at: string | null
          contrato_id: string | null
          costo_estimado: number | null
          created_at: string
          descripcion: string | null
          ejecutada_at: string | null
          estado: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite: string | null
          fecha_programada: string | null
          id: string
          incidencia_id: string | null
          iniciada_at: string | null
          inspeccion_id: string | null
          numero: number
          origen: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id: number | null
          programacion_id: string | null
          requiere_aprobacion: boolean
          requiere_parada_servicio: boolean
          requiere_trabajo_alturas: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          titulo: string
          updated_at: string | null
          ventana_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_ordenes_trabajo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_dar_baja_activo: {
        Args: {
          p_activo_id: string
          p_motivo: string
          p_periodo_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      fn_mant_generar_ot_desde_programacion: {
        Args: { p_programacion_id: string }
        Returns: {
          acreditacion_referencia: string | null
          activo_id: string | null
          anio: number
          aprobada_at: string | null
          aprobada_por: string | null
          asignado_tercero_id: string | null
          asignado_usuario_id: string | null
          cancelada_motivo: string | null
          cerrada_at: string | null
          contrato_id: string | null
          costo_estimado: number | null
          created_at: string
          descripcion: string | null
          ejecutada_at: string | null
          estado: Database["public"]["Enums"]["ot_estado_t"]
          fecha_limite: string | null
          fecha_programada: string | null
          id: string
          incidencia_id: string | null
          iniciada_at: string | null
          inspeccion_id: string | null
          numero: number
          origen: Database["public"]["Enums"]["ot_origen_t"]
          prioridad_id: number | null
          programacion_id: string | null
          requiere_aprobacion: boolean
          requiere_parada_servicio: boolean
          requiere_trabajo_alturas: boolean
          requisito_id: string | null
          tenant_id: string
          tipo_mantenimiento_id: number
          titulo: string
          updated_at: string | null
          ventana_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_ordenes_trabajo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_generar_programaciones: {
        Args: { p_plan_id: string }
        Returns: {
          generadas: number
          omitidas: number
        }[]
      }
      fn_mant_politica_aprobacion_vigente: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          estado: Database["public"]["Enums"]["vigencia_estado_t"]
          exige_por_parada_servicio: boolean
          id: string
          monto_umbral: number | null
          tenant_id: string
          updated_at: string | null
          version: number
          vigente_desde: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_politica_aprobacion_ot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_reconocer_depreciacion: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: {
          activo_id: string
          categoria: string
          comprobante_id: string
          detalle: string
        }[]
      }
      fn_mant_registrar_consumo: {
        Args: {
          p_almacen_id: string
          p_cantidad: number
          p_costo_unitario?: number
          p_ot_id: string
          p_repuesto_id: string
        }
        Returns: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          direccion: number
          documento_id: string | null
          id: string
          motivo: string | null
          orden_trabajo_id: string | null
          presupuesto_ejecucion_id: string | null
          registrado_at: string
          registrado_por: string | null
          repuesto_id: string
          tenant_id: string
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_inventario_movimientos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_registrar_devolucion: {
        Args: {
          p_almacen_id: string
          p_cantidad: number
          p_ot_id: string
          p_repuesto_id: string
        }
        Returns: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          direccion: number
          documento_id: string | null
          id: string
          motivo: string | null
          orden_trabajo_id: string | null
          presupuesto_ejecucion_id: string | null
          registrado_at: string
          registrado_por: string | null
          repuesto_id: string
          tenant_id: string
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_inventario_movimientos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_registrar_inspeccion: {
        Args: {
          p_acreditacion_referencia?: string
          p_activo_id?: string
          p_fecha: string
          p_formato_id: string
          p_respuestas: Json
          p_resultado_motivo?: string
          p_resultado_override?: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          p_tenant_id: string
          p_tercero_id?: string
        }
        Returns: {
          acreditacion_referencia: string | null
          activo_id: string | null
          created_at: string
          cumplimiento_id: string | null
          fecha: string
          formato_id: string
          formato_version: number
          id: string
          registrada_por: string | null
          resultado: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          resultado_motivo: string | null
          resultado_sugerido: Database["public"]["Enums"]["cumplimiento_resultado_t"]
          tenant_id: string
          tercero_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_inspecciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_mant_registrar_salud_snapshot: {
        Args: { p_activo_id: string; p_fecha?: string; p_tenant_id: string }
        Returns: string
      }
      fn_mant_resolver_alcance_plan: {
        Args: { p_plan_id: string }
        Returns: number
      }
      fn_mant_siguiente_numero: {
        Args: { p_anio: number; p_serie_id: number; p_tenant_id: string }
        Returns: number
      }
      fn_mant_transferir_repuesto: {
        Args: {
          p_almacen_destino_id: string
          p_almacen_origen_id: string
          p_cantidad: number
          p_repuesto_id: string
          p_tenant_id: string
        }
        Returns: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          direccion: number
          documento_id: string | null
          id: string
          motivo: string | null
          orden_trabajo_id: string | null
          presupuesto_ejecucion_id: string | null
          registrado_at: string
          registrado_por: string | null
          repuesto_id: string
          tenant_id: string
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo_t"]
          transferencia_par_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mant_inventario_movimientos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_marcar_cuenta_recaudo: {
        Args: { p_cuenta_id: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_marcar_pagador: {
        Args: {
          p_inmueble_id: string
          p_persona_rol_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      fn_matriz_trazabilidad: {
        Args: { p_tenant_id: string }
        Returns: {
          acciones_abiertas: number
          acciones_count: number
          cerrado: boolean
          control_automatizado: boolean
          control_id: string
          control_nombre: string
          evidencias_count: number
          hallazgo_estado: string
          hallazgo_id: string
          hallazgo_nivel: string
          hallazgo_proceso: string
          pruebas_count: number
          riesgo_id: string
          riesgo_inherente: number
          riesgo_nombre: string
        }[]
      }
      fn_normalizar_placa: { Args: { p_placa: string }; Returns: string }
      fn_notificar: {
        Args: {
          p_cuerpo?: string
          p_enlace?: string
          p_modulo: string
          p_origen_entidad: string
          p_origen_evento: string
          p_origen_id?: string
          p_origen_modulo: string
          p_prioridad: string
          p_tenant_id: string
          p_tipo_codigo: string
          p_titulo: string
        }
        Returns: string
      }
      fn_panel_acciones_cartera: {
        Args: { p_fecha_referencia: string; p_tenant_id: string }
        Returns: {
          acciones_fallidas: number
          acciones_pendientes_aprobacion: number
          acciones_programadas_hoy: number
          casos_juridicos_sin_actuacion_30d: number
          certificaciones_por_vencer: number
          cuotas_acuerdo_vencen_semana: number
          llamadas_pendientes: number
          promesas_vencen_hoy: number
        }[]
      }
      fn_pasarela_credenciales_presentes: {
        Args: { p_tenant_id: string }
        Returns: {
          config_id: string
          nombre: string
        }[]
      }
      fn_posicion_cartera: {
        Args: {
          p_fecha_corte: string
          p_inmueble_id?: string
          p_tenant_id: string
        }
        Returns: {
          cantidad_cargos_vencidos: number
          cargo_vencido_mas_antiguo_id: string
          deuda_capital: number
          deuda_interes: number
          deuda_otros: number
          deuda_total: number
          dias_mora_maximo: number
          fecha_vencimiento_mas_antigua: string
          inmueble_id: string
          saldo_credito: number
        }[]
      }
      fn_propietario_responsable: {
        Args: { p_fecha: string; p_inmueble_id: string }
        Returns: {
          nombre_completo: string
          numero_documento: string
          porcentaje: number
          tercero_id: string
        }[]
      }
      fn_rechazar_novedad: {
        Args: { p_motivo: string; p_novedad_id: string }
        Returns: {
          acuerdo_pago_id: string | null
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          cuotas_totales: number | null
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inhabilitada_at: string | null
          inhabilitada_motivo: string | null
          inhabilitada_por: string | null
          inmueble_id: string
          monto: number
          permanente: boolean
          presupuesto_cuenta_id: string | null
          prorrateable: boolean
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
          tipo_novedad_id: number | null
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_registrar_exportacion_libro: {
        Args: {
          p_filtros?: Json
          p_formato: string
          p_libro: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      fn_registrar_fuente_financiacion: {
        Args: {
          p_descripcion?: string
          p_fondo_id?: string
          p_fundamento_normativo_id?: number
          p_presupuesto_cuenta_id?: string
          p_presupuesto_id: string
          p_tipo_id: number
          p_valor_aplicado?: number
          p_valor_disponible: number
        }
        Returns: {
          created_at: string
          descripcion: string | null
          fondo_id: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_cuenta_id: string | null
          presupuesto_id: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        SetofOptions: {
          from: "*"
          to: "fuente_financiacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_registrar_pago_pasarela: {
        Args: {
          p_aplicaciones: Json
          p_fecha_pago: string
          p_forma_pago_id: number
          p_intencion_id: string
          p_monto: number
          p_revision_motivo?: string
          p_transaction_id: string
        }
        Returns: string
      }
      fn_reserva_aprobar: {
        Args: { p_reserva_id: string }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          cargo_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          inmueble_id: string
          motivo_cancelacion: string | null
          motivo_rechazo: string | null
          penalizada: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo: number | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_reservas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_reserva_cancelar_externa: {
        Args: { p_reserva_id: string; p_vinculo_id: string }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          cargo_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          inmueble_id: string
          motivo_cancelacion: string | null
          motivo_rechazo: string | null
          penalizada: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo: number | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_reservas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_reserva_crear_externa: {
        Args: {
          p_fecha: string
          p_hora_fin: string
          p_hora_inicio: string
          p_inmueble_id: string
          p_vinculo_id: string
          p_zona_comun_id: string
        }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          cargo_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          inmueble_id: string
          motivo_cancelacion: string | null
          motivo_rechazo: string | null
          penalizada: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo: number | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_reservas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_reserva_mis_reservas_externas: {
        Args: { p_vinculo_id: string }
        Returns: {
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          motivo_rechazo: string
          penalizada: boolean
          zona_comun_id: string
        }[]
      }
      fn_reserva_rechazar: {
        Args: { p_motivo: string; p_reserva_id: string }
        Returns: {
          aprobada_at: string | null
          aprobada_por: string | null
          cargo_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["reserva_estado_t"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          inmueble_id: string
          motivo_cancelacion: string | null
          motivo_rechazo: string | null
          penalizada: boolean
          solicitante_origen: Database["public"]["Enums"]["reserva_solicitante_t"]
          solicitante_ref: string | null
          tenant_id: string
          zona_comun_id: string
          zona_cupo_simultaneo: number | null
        }
        SetofOptions: {
          from: "*"
          to: "mant_reservas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_resetear_copropiedad: { Args: { p_tenant_id: string }; Returns: Json }
      fn_reversar_comprobante: {
        Args: {
          p_comprobante_id: string
          p_motivo: string
          p_periodo_destino: string
        }
        Returns: string
      }
      fn_sembrar_configuracion_cartera: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      fn_siguiente_consecutivo: {
        Args: { p_tenant_id: string; p_tipo_documento: string }
        Returns: string
      }
      fn_siguiente_numero_solicitud: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: number
      }
      fn_similitud_pagadores: {
        Args: { p_tenant_id: string; p_texto: string }
        Returns: {
          codigo: string
          inmueble_id: string
          similitud: number
        }[]
      }
      fn_solicitud_cancelar_externa: {
        Args: { p_solicitud_id: string; p_vinculo_id: string }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_solicitud_estado_externo: {
        Args: { p_actor_externo_vinculo_id: string; p_solicitud_id: string }
        Returns: {
          anio: number
          asunto: string
          cerrada_at: string
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          numero: number
          resuelta_at: string
          triage_motivo_rechazo: string
        }[]
      }
      fn_solicitud_mis_solicitudes_externas: {
        Args: { p_vinculo_id: string }
        Returns: {
          anio: number
          asunto: string
          categoria_id: number
          created_at: string
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          id: string
          numero: number
          tipo_id: number
          triage_motivo_rechazo: string
        }[]
      }
      fn_solicitud_recibir_externa: {
        Args: {
          p_actor_externo_vinculo_id: string
          p_asunto: string
          p_categoria_id: number
          p_descripcion?: string
          p_inmueble_id: string
          p_tipo_id: number
        }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_solicitud_triage_aceptar: {
        Args: {
          p_origen_id: number
          p_prioridad_id: number
          p_solicitud_id: string
        }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_solicitud_triage_rechazar: {
        Args: { p_motivo: string; p_solicitud_id: string }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_sugerir_plan_anual: {
        Args: { p_tenant_id: string }
        Returns: {
          categoria: string
          frecuencias: string
          hallazgos_abiertos: number
          hallazgos_criticos: number
          procesos: string
          riesgo_id: string
          riesgo_inherente: number
          riesgo_nombre: string
          score: number
          tiene_control_automatico: boolean
        }[]
      }
      fn_tenedores_vigentes: {
        Args: { p_fecha: string; p_inmueble_id: string }
        Returns: {
          nombre_completo: string
          numero_documento: string
          persona_rol_id: string
          rol_codigo: string
          tercero_id: string
          vigente_desde: string
          vigente_hasta: string
        }[]
      }
      fn_tipo_division_default: { Args: never; Returns: number }
      fn_toggle_compositor_correo: {
        Args: { p_activo: boolean; p_tenant_id: string }
        Returns: undefined
      }
      fn_toggle_plantilla_sms: {
        Args: { p_activo: boolean; p_event_type: string; p_tenant_id: string }
        Returns: {
          activo: boolean
          created_at: string
          cuerpo: string
          event_type: string
          id: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_unaccent_immutable: { Args: { p_texto: string }; Returns: string }
      fn_validar_contenido_plantilla: {
        Args: { p_texto: string }
        Returns: {
          categoria: string
          descripcion: string
          fundamento: string
          patron: string
        }[]
      }
      fn_vehiculo_por_placa: {
        Args: { p_placa: string; p_tenant_id: string }
        Returns: {
          autorizado: boolean
          color: string
          estado: Database["public"]["Enums"]["vehiculo_estado_t"]
          inmuebles: string[]
          marca: string
          modelo: string
          permiso_hasta: string
          placa: string
          responsables: string[]
          tipo: string
          vehiculo_id: string
        }[]
      }
      fundamento_validacion_pendiente: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          fundamento_id: number
          norma: string
        }[]
      }
      gobierno_actas_pendientes: {
        Args: { p_tenant_id: string }
        Returns: {
          cantidad: number
          concepto: string
        }[]
      }
      gobierno_archivar_expediente: {
        Args: { p_expediente_id: string; p_motivo: string }
        Returns: {
          anio: number
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          cerrado_at: string | null
          created_at: string
          descripcion_hechos: string
          estado_final: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          fecha_hechos: string
          id: string
          infraccion_id: string
          inmueble_id: string
          numero: number
          presunto_infractor_ref: string
          propietario_responsable_ref: string | null
          reportado_at: string
          reportado_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_expedientes_convivencia"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_compromisos_pendientes: {
        Args: { p_tenant_id: string }
        Returns: {
          compromiso_id: string
          decision_id: string
          estado: Database["public"]["Enums"]["gobierno_compromiso_estado_t"]
          fecha_limite: string
          responsable: string
          titulo: string
          vencido: boolean
        }[]
      }
      gobierno_crear_decision: {
        Args: {
          p_descripcion?: string
          p_fecha_limite?: string
          p_fundamento?: string
          p_prioridad?: string
          p_titulo: string
          p_votacion_id: string
        }
        Returns: {
          acta_id: string | null
          agenda_punto_id: string | null
          anio: number
          anulada_at: string | null
          anulada_motivo: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite: string | null
          fundamento: string | null
          id: string
          materia_id: number
          numero: number
          organo_id: string
          prioridad: string | null
          reunion_id: string
          revoca_decision_id: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          votacion_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_decisiones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_crear_solicitud: {
        Args: {
          p_actor_id?: string
          p_asunto: string
          p_calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          p_categoria_id: number
          p_descripcion?: string
          p_inmueble_id: string
          p_origen_id: number
          p_prioridad_id: number
          p_solicitante_ref: string
          p_tipo_id: number
        }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_decision_efectos: {
        Args: { p_decision_id: string }
        Returns: {
          descripcion: string
          entidad: string
          entidad_id: string
        }[]
      }
      gobierno_decision_ejecucion: {
        Args: { p_decision_id: string }
        Returns: {
          bloqueados: number
          cancelados: number
          cumplidos: number
          en_progreso: number
          estado_ejecucion: string
          porcentaje_avance: number
          semaforo: string
          total_compromisos: number
          vencidos: number
        }[]
      }
      gobierno_decision_origen: {
        Args: { p_entidad: string; p_entidad_id: string }
        Returns: {
          acta_id: string | null
          agenda_punto_id: string | null
          anio: number
          anulada_at: string | null
          anulada_motivo: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite: string | null
          fundamento: string | null
          id: string
          materia_id: number
          numero: number
          organo_id: string
          prioridad: string | null
          reunion_id: string
          revoca_decision_id: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          votacion_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_decisiones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_decisiones_estado: {
        Args: { p_tenant_id: string }
        Returns: {
          decision_id: string
          semaforo: string
          sin_compromisos: boolean
          titulo: string
        }[]
      }
      gobierno_detectar_vencimientos: {
        Args: { p_fecha?: string; p_tenant_id: string }
        Returns: {
          config_id: string
          created_at: string
          entidad_id: string
          envio_id: string | null
          fecha_deteccion: string
          id: string
          tenant_id: string
          tipo_vencimiento: Database["public"]["Enums"]["gobierno_tipo_vencimiento_t"]
        }[]
        SetofOptions: {
          from: "*"
          to: "gobierno_vencimiento_notificaciones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      gobierno_dias_habiles_entre: {
        Args: { p_desde: string; p_hasta: string }
        Returns: number
      }
      gobierno_es_dia_habil: { Args: { p_fecha: string }; Returns: boolean }
      gobierno_escalar_solicitud: {
        Args: {
          p_actor_id?: string
          p_destino_id: string
          p_destino_tipo: string
          p_solicitud_id: string
        }
        Returns: {
          agenda_punto_id: string | null
          anio: number
          anulada_motivo: string | null
          asignado_a: string | null
          asignado_at: string | null
          asunto: string
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          categoria_id: number
          cerrada_at: string | null
          creada_por: string | null
          created_at: string
          decision_id: string | null
          descripcion: string | null
          en_espera_desde: string | null
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          expediente_convivencia_id: string | null
          id: string
          inmueble_id: string
          numero: number
          orden_trabajo_referencia: string | null
          origen_actor_externo_id: string | null
          origen_id: number | null
          prioridad_id: number | null
          resuelta_at: string | null
          sla_id: string | null
          sla_vence_at: string | null
          solicitante_ref: string
          tenant_id: string
          tipo_id: number
          triage_motivo_rechazo: string | null
          triage_resuelto_at: string | null
          triage_resuelto_por: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_expedientes_detenidos: {
        Args: { p_tenant_id: string }
        Returns: {
          dias_detenido: number
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          expediente_id: string
        }[]
      }
      gobierno_festivos_colombia: {
        Args: { p_anio: number }
        Returns: string[]
      }
      gobierno_generar_acta: {
        Args: { p_reunion_id: string }
        Returns: {
          anio: number
          contenido_generado: Json
          created_at: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["acta_estado_t"]
          hash_contenido: string | null
          id: string
          incluye_voto_nominal: boolean
          narrativa: string | null
          numero: number | null
          plazo_disposicion_limite: string
          presidente_miembro_id: string
          puesta_a_disposicion_at: string | null
          reunion_id: string
          secretario_miembro_id: string
          suscrita_at: string | null
          suscrita_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_actas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_imponer_sancion: {
        Args: {
          p_actor_id?: string
          p_clase_sancion_codigo: string
          p_decision_id: string
          p_expediente_id: string
          p_monto?: number
          p_publicacion_documento_id?: string
          p_vigente_desde?: string
          p_vigente_hasta?: string
          p_zona_comun_id?: string
        }
        Returns: {
          clase_sancion_id: number
          created_at: string
          decision_id: string
          expediente_id: string
          id: string
          impuesta_at: string
          monto: number | null
          novedad_id: string | null
          publicacion_evidencia_documento_id: string | null
          tenant_id: string
          vigente_desde: string | null
          vigente_hasta: string | null
          zona_comun_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_sanciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_impugnaciones_en_tramite: {
        Args: { p_tenant_id: string }
        Returns: {
          dias_restantes: number
          impugnacion_id: string
          plazo_limite: string
        }[]
      }
      gobierno_informe_gestion: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: Json
      }
      gobierno_obligatoriedad_faltante: {
        Args: { p_fecha?: string; p_tenant_id: string }
        Returns: {
          cumplida: boolean
          motivo: string
          obligacion: string
        }[]
      }
      gobierno_organo_alertas: {
        Args: { p_tenant_id: string }
        Returns: {
          alerta: string
          detalle: string
          organo_id: string
        }[]
      }
      gobierno_organo_competente: {
        Args: {
          p_atribucion_codigo: string
          p_fecha: string
          p_tenant_id: string
        }
        Returns: {
          organo_id: string
          organo_tipo_codigo: string
          origen: Database["public"]["Enums"]["atribucion_origen_t"]
        }[]
      }
      gobierno_pascua: { Args: { p_anio: number }; Returns: string }
      gobierno_presentar_impugnacion: {
        Args: {
          p_actor_id?: string
          p_calidad?: string
          p_causal: string
          p_decision_id?: string
          p_documento_id?: string
          p_expediente_id?: string
          p_fecha_notificacion_objeto: string
          p_fecha_presentacion: string
          p_fundamento?: string
          p_impugnante_ref: string
          p_objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          p_suspende_efectos?: boolean
          p_suspension_fundamento?: string
        }
        Returns: {
          anio: number
          calidad: string | null
          causal: string
          created_at: string
          decision_id: string | null
          documento_id: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          expediente_id: string | null
          fecha_notificacion_objeto: string
          fecha_presentacion: string
          fundamento: string | null
          id: string
          impugnante_ref: string
          instancia: string | null
          numero: number
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_fundamento_valido: boolean
          plazo_limite: string
          presentada_en_plazo: boolean
          presentada_por: string | null
          resolucion_documento_id: string | null
          resuelta_at: string | null
          resultado:
            | Database["public"]["Enums"]["impugnacion_resultado_t"]
            | null
          resultado_detalle: string | null
          suspende_efectos: boolean
          suspension_fundamento: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_impugnaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_quorum: {
        Args: { p_momento: string; p_reunion_id: string }
        Returns: {
          coeficiente_presente: number
          coeficiente_total: number
          hay_pluralidad: boolean
          pct_presente: number
          propietarios_presentes: number
          quorum_deliberatorio: boolean
        }[]
      }
      gobierno_registrar_actuacion: {
        Args: {
          p_descripcion: string
          p_documento_id?: string
          p_etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          p_expediente_id: string
          p_fecha: string
          p_plazo_dias?: number
        }
        Returns: {
          created_at: string
          descripcion: string
          documento_id: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          expediente_id: string
          fecha: string
          fecha_limite: string | null
          id: string
          plazo_dias: number | null
          registrado_por: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_expediente_actuaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_registrar_actuacion_impugnacion: {
        Args: {
          p_descripcion: string
          p_documento_id?: string
          p_estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          p_fecha: string
          p_impugnacion_id: string
          p_instancia?: string
        }
        Returns: {
          created_at: string
          descripcion: string
          documento_id: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          fecha: string
          id: string
          impugnacion_id: string
          registrado_por: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_impugnacion_actuaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_registrar_actuacion_solicitud: {
        Args: {
          p_actor_id?: string
          p_descripcion: string
          p_documento_id?: string
          p_es_respuesta?: boolean
          p_estado_nuevo: Database["public"]["Enums"]["solicitud_estado_t"]
          p_fecha: string
          p_motivo?: string
          p_solicitud_id: string
        }
        Returns: {
          created_at: string
          descripcion: string
          documento_id: string | null
          es_respuesta: boolean
          estado: Database["public"]["Enums"]["solicitud_estado_t"]
          fecha: string
          id: string
          registrado_por: string | null
          solicitud_id: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitud_actuaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_reportar_expediente: {
        Args: {
          p_calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          p_descripcion_hechos: string
          p_fecha_hechos: string
          p_infraccion_id: string
          p_inmueble_id: string
          p_presunto_infractor_ref: string
        }
        Returns: {
          anio: number
          calidad: Database["public"]["Enums"]["gobierno_expediente_calidad_t"]
          cerrado_at: string | null
          created_at: string
          descripcion_hechos: string
          estado_final: string | null
          etapa: Database["public"]["Enums"]["gobierno_expediente_etapa_t"]
          fecha_hechos: string
          id: string
          infraccion_id: string
          inmueble_id: string
          numero: number
          presunto_infractor_ref: string
          propietario_responsable_ref: string | null
          reportado_at: string
          reportado_por: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_expedientes_convivencia"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_resolver_impugnacion: {
        Args: {
          p_actor_id?: string
          p_descripcion: string
          p_detalle?: string
          p_impugnacion_id: string
          p_instancia?: string
          p_resolucion_documento_id?: string
          p_resultado: Database["public"]["Enums"]["impugnacion_resultado_t"]
        }
        Returns: {
          anio: number
          calidad: string | null
          causal: string
          created_at: string
          decision_id: string | null
          documento_id: string | null
          estado: Database["public"]["Enums"]["impugnacion_estado_t"]
          expediente_id: string | null
          fecha_notificacion_objeto: string
          fecha_presentacion: string
          fundamento: string | null
          id: string
          impugnante_ref: string
          instancia: string | null
          numero: number
          objeto_tipo: Database["public"]["Enums"]["impugnacion_objeto_t"]
          plazo_fundamento_valido: boolean
          plazo_limite: string
          presentada_en_plazo: boolean
          presentada_por: string | null
          resolucion_documento_id: string | null
          resuelta_at: string | null
          resultado:
            | Database["public"]["Enums"]["impugnacion_resultado_t"]
            | null
          resultado_detalle: string | null
          suspende_efectos: boolean
          suspension_fundamento: string | null
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_impugnaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_reunion_coeficiente_actual: {
        Args: { p_reunion_id: string }
        Returns: number
      }
      gobierno_revocar_decision: {
        Args: {
          p_decision_id: string
          p_descripcion?: string
          p_fundamento?: string
          p_titulo: string
          p_votacion_revocatoria_id: string
        }
        Returns: {
          acta_id: string | null
          agenda_punto_id: string | null
          anio: number
          anulada_at: string | null
          anulada_motivo: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["gobierno_decision_estado_t"]
          fecha_limite: string | null
          fundamento: string | null
          id: string
          materia_id: number
          numero: number
          organo_id: string
          prioridad: string | null
          reunion_id: string
          revoca_decision_id: string | null
          tenant_id: string
          titulo: string
          updated_at: string | null
          votacion_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gobierno_decisiones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_revocar_token_consulta_inmueble: {
        Args: { p_actor_id?: string; p_motivo: string; p_token_id: string }
        Returns: {
          created_at: string
          expira_at: string
          generado_por: string | null
          id: string
          inmueble_id: string
          motivo_revocacion: string | null
          revocado_at: string | null
          revocado_por: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "atencion_tokens_consulta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gobierno_segmento_destinatarios: {
        Args: { p_criterio: string; p_tenant_id: string; p_valor: string }
        Returns: {
          email: string
          inmueble_id: string
          nombre: string
          telefono: string
          tercero_id: string
        }[]
      }
      gobierno_solicitudes_sla_estado: {
        Args: { p_dias_proximo?: number; p_tenant_id: string }
        Returns: {
          cantidad: number
          estado: string
        }[]
      }
      gobierno_sumar_dias_habiles: {
        Args: { p_dias: number; p_fecha: string }
        Returns: string
      }
      gobierno_sumar_horas_habiles: {
        Args: { p_desde: string; p_horas: number }
        Returns: string
      }
      gobierno_tablero_resumen: { Args: { p_tenant_id: string }; Returns: Json }
      gobierno_trasladar_lunes: { Args: { p_fecha: string }; Returns: string }
      has_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["tenant_role_t"][]
          p_tenant: string
        }
        Returns: boolean
      }
      invite_user: {
        Args: {
          p_email: string
          p_expires_at: string
          p_role: Database["public"]["Enums"]["tenant_role_t"]
          p_tenant_id: string
          p_token_hash: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_member: { Args: { p_tenant: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      mant_activo_estado_en: {
        Args: { p_activo_id: string; p_fecha: string; p_tenant_id: string }
        Returns: Database["public"]["Enums"]["activo_estado_t"]
      }
      mant_activo_garantias_vigentes: {
        Args: { p_activo_id: string; p_fecha?: string }
        Returns: {
          alcance: string
          exclusiones: string
          garantia_id: string
          origen: Database["public"]["Enums"]["garantia_origen_t"]
          vigente_hasta: string
        }[]
      }
      mant_atributos_huerfanos: {
        Args: { p_tenant_id: string }
        Returns: {
          activo_codigo: string
          activo_id: string
          clave: string
          valor: Json
        }[]
      }
      mant_autorizacion_visita_vigente_real: {
        Args: {
          p_estado: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
          p_qr_expira_at: string
        }
        Returns: Database["public"]["Enums"]["autorizacion_visita_estado_t"]
      }
      mant_calcular_depreciacion: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: {
          activo_id: string
          acumulada_nueva: number
          acumulada_previa: number
          base_depreciable: number
          cuota_mensual: number
          cuota_periodo: number
          meses_transcurridos: number
        }[]
      }
      mant_cobertura_requisitos: {
        Args: { p_tenant_id: string }
        Returns: {
          activo_codigo: string
          activo_id: string
          cubierto: boolean
          plan_frecuencia_meses: number
          plan_id: string
          plan_nombre: string
          requisito_id: string
          requisito_nombre: string
        }[]
      }
      mant_conciliacion_ppe: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          diferencia: number
          saldo_contable_clase_15: number
          valor_neto_activos: number
        }[]
      }
      mant_contrato_ejecucion: {
        Args: { p_contrato_id: string }
        Returns: {
          comprometido: number
          ejecutado: number
        }[]
      }
      mant_contrato_estado_visible: {
        Args: {
          p_contrato_id: string
          p_fecha?: string
          p_umbral_dias?: number
        }
        Returns: string
      }
      mant_costos: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          activo_id: string
          agrupacion_id: string
          categoria_activo_id: number
          monto: number
          tercero_id: string
          tipo_mantenimiento_id: number
        }[]
      }
      mant_criticidad: {
        Args: { p_activo_id: string }
        Returns: {
          banda: string
          desglose: Json
          puntaje_total: number
        }[]
      }
      mant_diagnostico_cron_job_existe: {
        Args: { p_jobname: string }
        Returns: boolean
      }
      mant_estado_cumplimiento: {
        Args: { p_fecha?: string; p_tenant_id: string; p_umbral_dias?: number }
        Returns: {
          activo_codigo: string
          activo_id: string
          estado: string
          requisito_id: string
          requisito_nombre: string
          ultima_fecha: string
          vence_at: string
        }[]
      }
      mant_evaluar_escenario: {
        Args: { p_escenario_id: string }
        Returns: Json
      }
      mant_habilitaciones_semaforo: {
        Args: { p_fecha?: string; p_tercero_id: string; p_umbral_dias?: number }
        Returns: {
          estado: string
          habilitacion_id: string
          tipo_id: number
          tipo_nombre: string
          vigente_desde: string
          vigente_hasta: string
        }[]
      }
      mant_hallazgos_abiertos: {
        Args: { p_tenant_id: string }
        Returns: {
          descripcion: string
          dias_abierto: number
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string
          hallazgo_id: string
          inspeccion_id: string
          ot_id: string
          severidad: Database["public"]["Enums"]["severidad_t"]
          vencido: boolean
        }[]
      }
      mant_indicador_comprometido_estimado: {
        Args: { p_tenant_id: string }
        Returns: {
          comprometido_estimado: number
          ordenes_con_estimado: number
          ordenes_sin_estimado: number
        }[]
      }
      mant_indicador_costo_m2: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          area_privada_total: number
          costo_m2: number
          costo_total: number
        }[]
      }
      mant_indicador_cumplimiento_normativo: {
        Args: { p_fecha?: string; p_tenant_id: string; p_umbral_dias?: number }
        Returns: {
          cantidad: number
          estado: string
        }[]
      }
      mant_indicador_cumplimiento_plan: {
        Args: {
          p_activo_id?: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          ejecutadas: number
          excluidas_activo_no_disponible: number
          pct: number
          programadas: number
        }[]
      }
      mant_indicador_disponibilidad: {
        Args: {
          p_activo_id: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          disponibilidad_pct: number
          horas_cubiertas: number
        }[]
      }
      mant_indicador_financiero_presupuesto: {
        Args: {
          p_cuenta_id?: string
          p_presupuesto_id: string
          p_tenant_id: string
        }
        Returns: {
          cuenta_codigo: string
          cuenta_id: string
          cuenta_nombre: string
          cuenta_ruta: string
          ejecutado: number
          presupuestado: number
        }[]
      }
      mant_indicador_habilitaciones_vencidas: {
        Args: { p_fecha?: string; p_tenant_id: string; p_umbral_dias?: number }
        Returns: {
          estado: string
          habilitacion_id: string
          tercero_id: string
          tercero_nombre: string
          tipo_id: number
          tipo_nombre: string
          vigente_hasta: string
        }[]
      }
      mant_indicador_hallazgos_criticos: {
        Args: { p_tenant_id: string }
        Returns: {
          activo_id: string
          descripcion: string
          dias_abierto: number
          estado: Database["public"]["Enums"]["hallazgo_estado_t"]
          fecha_limite: string
          hallazgo_id: string
          inspeccion_id: string
        }[]
      }
      mant_indicador_mtbf: {
        Args: {
          p_activo_id: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          fallas: number
          mtbf_horas: number
        }[]
      }
      mant_indicador_mttr: {
        Args: {
          p_activo_id?: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          mttr_horas: number
          muestras: number
        }[]
      }
      mant_indicador_ot_a_tiempo: {
        Args: {
          p_activo_id?: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          a_tiempo: number
          cerradas: number
          pct: number
        }[]
      }
      mant_indicador_proporcion_mantenimiento: {
        Args: { p_desde: string; p_hasta: string; p_tenant_id: string }
        Returns: {
          cantidad: number
          tipo_codigo: string
          tipo_id: number
          tipo_nombre: string
        }[]
      }
      mant_inventario_pendientes_contabilizar: {
        Args: { p_tenant_id: string }
        Returns: {
          cantidad: number
          motivo_bloqueo: string
          movimiento_id: string
          orden_trabajo_id: string
          registrado_at: string
          repuesto_id: string
        }[]
      }
      mant_ppe_movimiento_ejercicio: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: {
          adiciones: number
          categoria_codigo: string
          depreciacion_ejercicio: number
          retiros: number
          saldo_final: number
          saldo_inicial: number
        }[]
      }
      mant_ppe_pendiente_depreciacion: {
        Args: { p_periodo_id: string; p_tenant_id: string }
        Returns: {
          activo_id: string
          cuota_periodo: number
        }[]
      }
      mant_ppe_por_activo: {
        Args: { p_fecha_corte: string; p_tenant_id: string }
        Returns: {
          activo_id: string
          categoria_codigo: string
          cuenta_codigo: string
          depreciacion_acumulada: number
          valor_adquisicion: number
          valor_neto: number
        }[]
      }
      mant_previsualizar_alcance: {
        Args: {
          p_activo_id?: string
          p_agrupacion_id?: string
          p_alcance: Database["public"]["Enums"]["plan_alcance_t"]
          p_categoria_id?: number
          p_tenant_id: string
          p_tipo_activo_id?: number
          p_zona_comun_id?: string
        }
        Returns: {
          activo_padre_id: string | null
          agrupacion_id: string | null
          atributos: Json
          capitalizado: boolean
          categoria_id: number
          centro_costo_id: number | null
          codigo: string
          contable_cuenta_id: string | null
          created_at: string
          descripcion: string | null
          documento_soporte_id: string | null
          estado: Database["public"]["Enums"]["activo_estado_t"]
          fabricante: string | null
          fecha_adquisicion: string | null
          fecha_inicio_depreciacion: string | null
          fecha_instalacion: string | null
          fecha_puesta_servicio: string | null
          fecha_retiro: string | null
          id: string
          imagen_documento_id: string | null
          marca: string | null
          metodo_depreciacion:
            | Database["public"]["Enums"]["depreciacion_metodo_t"]
            | null
          modelo: string | null
          naturaleza_bien: Database["public"]["Enums"]["activo_naturaleza_bien_t"]
          nombre: string
          numero_serie: string | null
          origen: Database["public"]["Enums"]["activo_origen_t"]
          qr_token: string | null
          tenant_id: string
          tipo_id: number
          ubicacion_detalle: string | null
          updated_at: string | null
          valor_adquisicion: number | null
          valor_residual: number
          vida_util_meses: number | null
          zona_comun_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "activos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mant_prioridad_sugerida: {
        Args: { p_activo_id: string; p_severidad_id: number }
        Returns: {
          banda_criticidad: string
          encontrada: boolean
          prioridad_id: number
          prioridad_nombre: string
          severidad_nombre: string
        }[]
      }
      mant_proyeccion: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: {
          componente: string
          datos_insuficientes: boolean
          metodo: string
          monto: number
        }[]
      }
      mant_salud: {
        Args: { p_activo_id: string; p_fecha?: string; p_tenant_id: string }
        Returns: {
          desglose: Json
          indice: number
          set_id: string
          version: number
        }[]
      }
      mant_salud_aplicar_escala: {
        Args: { p_escala: Json; p_valor: number }
        Returns: number
      }
      mant_salud_explicacion: {
        Args: {
          p_activo_id: string
          p_desde: string
          p_hasta: string
          p_tenant_id: string
        }
        Returns: {
          contribucion_desde: number
          contribucion_hasta: number
          factor_codigo: string
          factor_nombre: string
          variacion: number
        }[]
      }
      mant_stock: {
        Args: {
          p_almacen_id: string
          p_fecha?: string
          p_repuesto_id: string
          p_tenant_id: string
        }
        Returns: number
      }
      mant_tendencia_fallas: {
        Args: {
          p_activo_id: string
          p_dias_ventana?: number
          p_tenant_id: string
          p_umbral_observaciones?: number
          p_ventanas: number
        }
        Returns: {
          costo: number
          desde: string
          fallas: number
          hasta: string
          mttr_horas: number
          tendencia: string
          variacion_pct: number
          ventana: number
        }[]
      }
      mant_verificar_habilitacion_tercero: {
        Args: {
          p_activo_id?: string
          p_costo_estimado?: number
          p_requiere_parada_servicio?: boolean
          p_requiere_trabajo_alturas?: boolean
          p_tenant_id: string
          p_tercero_id: string
          p_tipo_mantenimiento_id?: number
        }
        Returns: {
          bloqueante: boolean
          motivo: string
          tipo_habilitacion_id: number
          tipo_habilitacion_nombre: string
        }[]
      }
      presupuesto_cuenta_ejecucion: {
        Args: { p_presupuesto_id: string }
        Returns: {
          cuenta_id: string
          ejecutado: number
          presupuestado: number
        }[]
      }
      presupuesto_cuenta_totales: {
        Args: { p_presupuesto_id: string }
        Returns: {
          cuenta_id: string
          monto_acumulado: number
        }[]
      }
      puede_ver_modulo: {
        Args: { p_modulo: string; p_tenant: string }
        Returns: boolean
      }
      purge_audit_log_antiguo: { Args: never; Returns: undefined }
      purge_rate_limit_hits_antiguo: { Args: never; Returns: undefined }
      resend_invitation: {
        Args: {
          p_expires_at: string
          p_invitation_id: string
          p_token_hash: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["tenant_role_t"]
          status: Database["public"]["Enums"]["invite_status_t"]
          tenant_id: string
          token_hash: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_tenant_predeterminado: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      shares_tenant_with: { Args: { p_user: string }; Returns: boolean }
      switch_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      tenant_marco_contable: {
        Args: { p_tenant_id: string }
        Returns: {
          agente_retencion: boolean
          clasificado: boolean
          estados_requeridos: string[]
          explota_bienes_comunes: boolean
          marco_grupo: string
          responsable_iva: boolean
          uso_economico: string
        }[]
      }
      tiene_rol_funcional: {
        Args: { p_modulo: string; p_tenant: string }
        Returns: boolean
      }
      tributario_base_exogena: {
        Args: { p_anio: number; p_tenant_id: string }
        Returns: Json
      }
      tributario_certificado_retencion: {
        Args: {
          p_desde: string
          p_hasta: string
          p_tenant_id: string
          p_tercero_id: string
        }
        Returns: {
          concepto_codigo: string
          concepto_nombre: string
          tarifa: number
          total_base: number
          total_valor: number
        }[]
      }
      tributario_resumen_iva: {
        Args: { p_anio: number; p_periodo_numero: number; p_tenant_id: string }
        Returns: {
          mes_desde: number
          mes_hasta: number
          total_base: number
          total_valor: number
        }[]
      }
      tributario_resumen_retenciones_mensual: {
        Args: { p_anio: number; p_mes: number; p_tenant_id: string }
        Returns: {
          concepto_codigo: string
          concepto_nombre: string
          total_base: number
          total_valor: number
        }[]
      }
      validar_cuenta_contable_destino: {
        Args: {
          p_cuenta_id: string
          p_prefijo_codigo?: string
          p_tenant_id: string
        }
        Returns: {
          activa: boolean
          clase: number
          codigo: string
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["contable_naturaleza_t"]
          naturaleza_tributaria_id: number | null
          nivel: number
          nombre: string
          parent_id: string | null
          permite_movimiento: boolean
          plan_cuenta_id: string | null
          requiere_centro_costo: boolean
          requiere_fondo: boolean
          requiere_inmueble: boolean
          requiere_tercero: boolean
          tenant_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "contable_cuenta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      acta_estado_t: "borrador" | "en_verificacion" | "suscrita" | "publicada"
      activo_estado_t:
        | "planificado"
        | "adquirido"
        | "instalado"
        | "en_servicio"
        | "en_mantenimiento"
        | "fuera_de_servicio"
        | "en_reparacion"
        | "retirado"
        | "dispuesto"
      activo_naturaleza_bien_t:
        | "bien_comun_esencial"
        | "bien_comun_no_esencial_desafectado"
        | "bien_propio"
      activo_origen_t:
        | "comprado"
        | "recibido_constructora"
        | "donado"
        | "reposicion"
      actor_externo_origen_t: "autoverificacion" | "staff"
      actor_externo_persona_t: "propietario" | "tenedor"
      alcance_accion_cobranza_t: "inmueble" | "cargo"
      anuncio_estado_t:
        | "borrador"
        | "pendiente_revision"
        | "aprobado"
        | "programado"
        | "publicado"
        | "archivado"
        | "rechazado"
        | "cancelado"
      asistencia_calidad_t: "propietario" | "apoderado" | "invitado" | "organo"
      atribucion_origen_t: "ley" | "reglamento"
      atributo_tipo_dato_t: "numero" | "texto" | "booleano" | "fecha" | "opcion"
      autorizacion_origen_t: "externo" | "staff"
      autorizacion_visita_estado_t: "vigente" | "usada" | "vencida" | "revocada"
      base_calculo_t: "coeficientes_representados" | "coeficientes_totales"
      canal_cobranza_t:
        | "email"
        | "sms"
        | "whatsapp"
        | "telefono"
        | "fisico"
        | "interno"
      cargo_categoria_t: "capital" | "interes" | "otro"
      cargo_origen_t:
        | "liquidacion_linea"
        | "novedad"
        | "interes"
        | "descuento"
        | "reserva"
      compromiso_bancario_estado_t:
        | "proyectado"
        | "reservado"
        | "ejecutado"
        | "liberado"
        | "anulado"
      compromiso_bancario_origen_t: "factura_proveedor" | "lote_pago" | "manual"
      concepto_alcance_t: "todos" | "calculado"
      concepto_criterio_distribucion_t: "coeficiente" | "area_privada"
      concepto_estado_t: "borrador" | "en_revision" | "activo" | "archivado"
      concepto_modo_calculo_t: "directo" | "distribucion"
      concepto_modo_valor_t: "fijo" | "formulado"
      concepto_periodicidad_t:
        | "mensual"
        | "bimensual"
        | "trimestral"
        | "semestral"
        | "anual"
      concepto_tipo_recurrencia_t:
        | "recurrente"
        | "unico"
        | "por_periodo"
        | "novedad"
      conciliacion_estado_t:
        | "pendiente"
        | "conciliada_auto"
        | "conciliada_manual"
        | "descartada"
      conciliacion_metodo_t: "referencia" | "monto_fecha" | "heuristico"
      contable_comprobante_estado_t: "borrador" | "contabilizado" | "anulado"
      contable_naturaleza_t: "debito" | "credito"
      contable_periodo_estado_t: "abierto" | "cerrado" | "bloqueado"
      contrato_estado_t: "borrador" | "vigente" | "suspendido" | "terminado"
      copropiedad_uso_t: "residencial" | "comercial" | "mixto"
      cuenta_bancaria_tipo_t: "ahorros" | "corriente" | "billetera"
      cumplimiento_resultado_t: "conforme" | "con_hallazgos" | "no_conforme"
      depreciacion_metodo_t: "linea_recta" | "no_deprecia"
      descuento_pronto_pago_modo_t: "reduce_deuda" | "saldo_a_favor"
      deterioro_metodo_t: "antiguedad" | "porcentaje_global" | "individual"
      ejecucion_liquidacion_t: "pagado_banco" | "pagado_caja" | "por_pagar"
      escenario_tipo_t: "reparar" | "reemplazar" | "mantener"
      estado_accion_cobranza_t:
        | "programada"
        | "pendiente_aprobacion"
        | "aprobada"
        | "rechazada"
        | "ejecutando"
        | "ejecutada"
        | "fallida"
        | "cancelada"
      estado_acuerdo_t:
        | "borrador"
        | "pendiente_aprobacion"
        | "vigente"
        | "cumplido"
        | "incumplido"
        | "cancelado"
      estado_acuse_t:
        | "encolado"
        | "entregado"
        | "leido"
        | "rebotado"
        | "fallido"
        | "no_entregable"
      estado_caso_juridico_t:
        | "remitido"
        | "documentacion"
        | "radicado"
        | "admitido"
        | "en_tramite"
        | "medidas_cautelares"
        | "conciliacion"
        | "sentencia"
        | "ejecucion"
        | "terminado"
        | "desistido"
        | "archivado"
      estado_certificacion_t: "vigente" | "anulada"
      estado_costa_t:
        | "liquidada"
        | "impugnada"
        | "en_firme"
        | "recuperada"
        | "no_recuperable"
      estado_cuota_acuerdo_t:
        | "pendiente"
        | "parcial"
        | "pagada"
        | "vencida"
        | "incumplida"
        | "cancelada"
      estado_linea_tipo_t:
        | "grupo"
        | "detalle"
        | "subtotal"
        | "total"
        | "calculada"
      estado_promesa_t: "pendiente" | "cumplida" | "incumplida" | "cancelada"
      etapa_cobranza_t:
        | "preventiva"
        | "administrativa"
        | "prejuridica"
        | "juridica"
        | "judicial"
      extracto_origen_t: "banco" | "pasarela" | "datafono"
      factura_estado_t:
        | "borrador"
        | "registrada"
        | "en_revision"
        | "en_disputa"
        | "aprobada"
        | "programada"
        | "pagada_parcial"
        | "pagada"
        | "anulada"
      finanzas_flujo_escenario_t: "base" | "conservador" | "optimista"
      fondo_base_calculo_t: "presupuesto_anual" | "cuota_administracion"
      fondo_compromiso_estado_t:
        | "proyectado"
        | "comprometido"
        | "parcialmente_ejecutado"
        | "ejecutado"
        | "liberado"
        | "anulado"
      fondo_estado_t:
        | "propuesto"
        | "pendiente_autorizacion"
        | "activo"
        | "suspendido"
        | "agotado"
        | "en_cierre"
        | "cerrado"
        | "cancelado"
      fondo_movimiento_tipo_t:
        | "aporte"
        | "uso"
        | "rendimiento"
        | "traslado_entrada"
        | "traslado_salida"
        | "ajuste"
        | "reversion"
        | "cierre_remanente"
      fondo_naturaleza_t: "imprevistos" | "destinacion_especifica"
      fondo_solicitud_uso_estado_t:
        | "borrador"
        | "en_revision"
        | "aprobada"
        | "rechazada"
        | "comprometida"
        | "ejecutada"
        | "anulada"
      fundamento_estado_t: "activo" | "propuesto" | "rechazado"
      fundamento_tipo_t:
        | "ley"
        | "decreto"
        | "reglamento_ph"
        | "decision_asamblea"
        | "otra"
        | "orientacion_tecnica"
      garantia_origen_t:
        | "constructora"
        | "fabricante"
        | "proveedor"
        | "contrato"
      gobierno_compromiso_estado_t:
        | "pendiente"
        | "en_progreso"
        | "bloqueado"
        | "cumplido"
        | "cancelado"
      gobierno_decision_estado_t:
        | "vigente"
        | "anulada"
        | "revocada"
        | "impugnada"
      gobierno_expediente_calidad_t: "propietario" | "tenedor" | "tercero"
      gobierno_expediente_etapa_t:
        | "reportado"
        | "conciliacion_comite"
        | "requerimiento_escrito"
        | "descargos"
        | "decision_organo"
        | "sancion_impuesta"
        | "archivado"
        | "impugnacion"
        | "firme"
      gobierno_tipo_vencimiento_t:
        | "compromiso"
        | "expediente_convivencia"
        | "impugnacion"
        | "solicitud"
        | "acta_disposicion"
      hallazgo_estado_t: "abierto" | "en_tratamiento" | "aceptado" | "cerrado"
      impugnacion_estado_t:
        | "presentada"
        | "en_tramite"
        | "resuelta"
        | "desistida"
      impugnacion_objeto_t: "decision" | "sancion"
      impugnacion_resultado_t:
        | "confirmada"
        | "revocada"
        | "modificada"
        | "inadmitida"
      incidencia_estado_t:
        | "reportada"
        | "en_evaluacion"
        | "convertida"
        | "resuelta"
        | "descartada"
      inmueble_estado_t: "activo" | "inactivo"
      intencion_pago_estado_t:
        | "creada"
        | "pendiente"
        | "aprobada"
        | "rechazada"
        | "expirada"
      interes_day_count_t:
        | "mensual_30_dias_reales"
        | "actual_365"
        | "actual_360"
        | "treinta_360"
      interes_descuento_orden_t:
        | "interes_sobre_capital_completo"
        | "descuento_antes_interes"
      inventario_alerta_tipo_t: "stock_bajo" | "sin_stock" | "punto_reorden"
      invite_status_t: "pending" | "accepted" | "revoked" | "expired"
      liquidacion_estado_t:
        | "pre_liquidada"
        | "pendiente_aprobacion"
        | "rechazada"
        | "aplicada"
        | "descartada"
        | "anulada"
        | "fallida"
      lote_estado_t:
        | "borrador"
        | "programado"
        | "aprobado"
        | "ejecutado"
        | "conciliado"
        | "anulado"
      mant_habilitacion_condicion_t:
        | "categoria_activo"
        | "tipo_mantenimiento"
        | "trabajo_alturas"
        | "parada_servicio"
        | "monto_minimo"
      marco_contable_grupo_t: "grupo_2" | "grupo_3"
      mayoria_tipo_t: "ordinaria" | "calificada_70" | "unanimidad"
      member_status_t: "active" | "revoked"
      movimiento_tipo_t: "entrada" | "salida" | "ajuste" | "transferencia"
      nivel_riesgo_t: "ninguno" | "bajo" | "medio" | "alto" | "critico"
      novedad_estado_t: "pendiente" | "aprobada" | "rechazada"
      novedad_tipo_t:
        | "CHARGE"
        | "DISCOUNT"
        | "ADJUSTMENT"
        | "REFUND"
        | "CREDIT"
        | "DEBIT"
      origen_accion_cobranza_t: "job" | "manual"
      origen_acuse_t: "proveedor" | "manual"
      origen_evento_t: "job" | "usuario" | "sistema" | "integracion"
      ot_estado_t:
        | "borrador"
        | "programada"
        | "asignada"
        | "en_ejecucion"
        | "ejecutada"
        | "pendiente_aprobacion"
        | "cerrada"
        | "cancelada"
      ot_origen_t: "programacion" | "incidencia" | "inspeccion" | "manual"
      pasarela_modo_t: "sandbox" | "produccion"
      pasarela_proveedor_t: "wompi" | "payu" | "epayco" | "bold"
      periodo_estado_t: "abierto" | "en_liquidacion" | "cerrado" | "bloqueado"
      permiso_vehiculo_estado_t: "vigente" | "revocado"
      plan_alcance_t: "activo" | "tipo_activo" | "categoria" | "ubicacion"
      plan_frecuencia_origen_t: "heredada_requisito" | "propia"
      politica_imputacion_estrategia_t: "deuda_mas_antigua" | "periodo_actual"
      posicion_naturaleza_t:
        | "activo_liquido"
        | "restringido"
        | "obligacion"
        | "derecho"
      presupuesto_cuenta_naturaleza_t: "ingreso" | "egreso"
      presupuesto_estado_t: "borrador" | "aprobado" | "vigente" | "cerrado"
      presupuesto_reconocimiento_ingreso_t: "causacion" | "caja"
      programacion_estado_t: "pendiente" | "generada" | "omitida" | "cancelada"
      propuesta_estado_t: "pendiente" | "aprobada" | "rechazada"
      redondeo_modo_t: "half_up" | "half_even" | "down" | "up"
      requisito_tipo_t:
        | "legal_nacional"
        | "legal_territorial"
        | "tecnico_fabricante"
        | "contractual"
        | "interno"
      reserva_estado_t:
        | "solicitada"
        | "aprobada"
        | "rechazada"
        | "cancelada"
        | "completada"
        | "no_show"
      reserva_solicitante_t: "externo" | "staff"
      residual_metodo_t: "mayor_resto"
      respuesta_valor_t: "conforme" | "no_conforme" | "no_aplica"
      resultado_accion_cobranza_t:
        | "sin_respuesta"
        | "contacto_efectivo"
        | "contacto_no_efectivo"
        | "promesa_de_pago"
        | "acuerdo_solicitado"
        | "pago_recibido"
        | "rechazo_deudor"
        | "datos_incorrectos"
        | "no_aplica"
      reunion_convocatoria_t:
        | "primera"
        | "segunda"
        | "universal_sin_convocatoria"
      reunion_estado_t: "convocada" | "instalada" | "cerrada" | "cancelada"
      reunion_modalidad_t: "presencial" | "no_presencial" | "mixta"
      severidad_t: "critico" | "mayor" | "menor" | "observacion"
      solicitud_estado_t:
        | "nueva"
        | "asignada"
        | "en_atencion"
        | "en_espera"
        | "resuelta"
        | "cerrada"
        | "anulada"
        | "recibida_externa"
        | "rechazada_triage"
        | "cancelada_por_solicitante"
      tarea_estado_t: "pendiente" | "ejecutada" | "no_aplica"
      tenant_role_t: "auxiliar" | "auditor" | "administrador"
      tenant_status_t: "active" | "suspended" | "deleted"
      tercero_tipo_t: "natural" | "juridica"
      tipo_accion_cobranza_t:
        | "email"
        | "sms"
        | "whatsapp"
        | "llamada"
        | "carta"
        | "requerimiento_formal"
        | "aviso_prejuridico"
        | "publicacion_morosos"
        | "restriccion_servicios"
        | "visita"
        | "asignacion_abogado"
        | "remision_juridica"
        | "propuesta_acuerdo"
        | "revision_manual"
      tipo_costa_t:
        | "gasto_proceso"
        | "agencias_en_derecho"
        | "honorario_auxiliar"
        | "otro_costo_aprobado"
      tipo_evento_cartera_t:
        | "CARGO_VENCIDO"
        | "CARGO_SALDADO"
        | "CARTERA_CLASIFICACION_CAMBIO"
        | "CARTERA_ETAPA_CAMBIO"
        | "CARTERA_POSICION_CONGELADA"
        | "COBRANZA_ACCION_PROGRAMADA"
        | "COBRANZA_ACCION_APROBADA"
        | "COBRANZA_ACCION_RECHAZADA"
        | "COBRANZA_ACCION_EJECUTADA"
        | "COBRANZA_ACCION_FALLIDA"
        | "COBRANZA_ACCION_OMITIDA"
        | "COBRANZA_ACCION_CANCELADA"
        | "COBRANZA_RESULTADO_REGISTRADO"
        | "PROMESA_REGISTRADA"
        | "PROMESA_CUMPLIDA"
        | "PROMESA_INCUMPLIDA"
        | "ACUERDO_CREADO"
        | "ACUERDO_APROBADO"
        | "ACUERDO_CUOTA_VENCIDA"
        | "ACUERDO_CUOTA_PAGADA"
        | "ACUERDO_CUMPLIDO"
        | "ACUERDO_INCUMPLIDO"
        | "CERTIFICACION_DEUDA_EXPEDIDA"
        | "CERTIFICACION_DEUDA_ANULADA"
        | "CASO_JURIDICO_CREADO"
        | "CASO_JURIDICO_ACTUACION"
        | "CASO_JURIDICO_ESTADO_CAMBIO"
        | "CASO_JURIDICO_CERRADO"
        | "COSTA_JUDICIAL_REGISTRADA"
        | "PAGO_REGISTRADO"
        | "PAGO_IMPUTADO"
        | "INTERES_CALCULADO"
        | "NOVEDAD_APROBADA"
        | "LIQUIDACION_COMPLETADA"
      tipo_tasa_referencia_t: "ibc_consumo_ordinario"
      user_status_t: "active" | "suspended"
      vehiculo_estado_t: "activo" | "inactivo" | "retirado"
      vigencia_estado_t: "borrador" | "vigente" | "historica"
      votacion_estado_t: "abierta" | "cerrada" | "anulada"
      votacion_metodo_t: "si_no_abstencion" | "opciones" | "eleccion"
      votacion_resultado_t: "aprobada" | "rechazada" | "sin_quorum"
      votacion_sentido_t: "favor" | "contra" | "abstencion"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      acta_estado_t: ["borrador", "en_verificacion", "suscrita", "publicada"],
      activo_estado_t: [
        "planificado",
        "adquirido",
        "instalado",
        "en_servicio",
        "en_mantenimiento",
        "fuera_de_servicio",
        "en_reparacion",
        "retirado",
        "dispuesto",
      ],
      activo_naturaleza_bien_t: [
        "bien_comun_esencial",
        "bien_comun_no_esencial_desafectado",
        "bien_propio",
      ],
      activo_origen_t: [
        "comprado",
        "recibido_constructora",
        "donado",
        "reposicion",
      ],
      actor_externo_origen_t: ["autoverificacion", "staff"],
      actor_externo_persona_t: ["propietario", "tenedor"],
      alcance_accion_cobranza_t: ["inmueble", "cargo"],
      anuncio_estado_t: [
        "borrador",
        "pendiente_revision",
        "aprobado",
        "programado",
        "publicado",
        "archivado",
        "rechazado",
        "cancelado",
      ],
      asistencia_calidad_t: ["propietario", "apoderado", "invitado", "organo"],
      atribucion_origen_t: ["ley", "reglamento"],
      atributo_tipo_dato_t: ["numero", "texto", "booleano", "fecha", "opcion"],
      autorizacion_origen_t: ["externo", "staff"],
      autorizacion_visita_estado_t: ["vigente", "usada", "vencida", "revocada"],
      base_calculo_t: ["coeficientes_representados", "coeficientes_totales"],
      canal_cobranza_t: [
        "email",
        "sms",
        "whatsapp",
        "telefono",
        "fisico",
        "interno",
      ],
      cargo_categoria_t: ["capital", "interes", "otro"],
      cargo_origen_t: [
        "liquidacion_linea",
        "novedad",
        "interes",
        "descuento",
        "reserva",
      ],
      compromiso_bancario_estado_t: [
        "proyectado",
        "reservado",
        "ejecutado",
        "liberado",
        "anulado",
      ],
      compromiso_bancario_origen_t: [
        "factura_proveedor",
        "lote_pago",
        "manual",
      ],
      concepto_alcance_t: ["todos", "calculado"],
      concepto_criterio_distribucion_t: ["coeficiente", "area_privada"],
      concepto_estado_t: ["borrador", "en_revision", "activo", "archivado"],
      concepto_modo_calculo_t: ["directo", "distribucion"],
      concepto_modo_valor_t: ["fijo", "formulado"],
      concepto_periodicidad_t: [
        "mensual",
        "bimensual",
        "trimestral",
        "semestral",
        "anual",
      ],
      concepto_tipo_recurrencia_t: [
        "recurrente",
        "unico",
        "por_periodo",
        "novedad",
      ],
      conciliacion_estado_t: [
        "pendiente",
        "conciliada_auto",
        "conciliada_manual",
        "descartada",
      ],
      conciliacion_metodo_t: ["referencia", "monto_fecha", "heuristico"],
      contable_comprobante_estado_t: ["borrador", "contabilizado", "anulado"],
      contable_naturaleza_t: ["debito", "credito"],
      contable_periodo_estado_t: ["abierto", "cerrado", "bloqueado"],
      contrato_estado_t: ["borrador", "vigente", "suspendido", "terminado"],
      copropiedad_uso_t: ["residencial", "comercial", "mixto"],
      cuenta_bancaria_tipo_t: ["ahorros", "corriente", "billetera"],
      cumplimiento_resultado_t: ["conforme", "con_hallazgos", "no_conforme"],
      depreciacion_metodo_t: ["linea_recta", "no_deprecia"],
      descuento_pronto_pago_modo_t: ["reduce_deuda", "saldo_a_favor"],
      deterioro_metodo_t: ["antiguedad", "porcentaje_global", "individual"],
      ejecucion_liquidacion_t: ["pagado_banco", "pagado_caja", "por_pagar"],
      escenario_tipo_t: ["reparar", "reemplazar", "mantener"],
      estado_accion_cobranza_t: [
        "programada",
        "pendiente_aprobacion",
        "aprobada",
        "rechazada",
        "ejecutando",
        "ejecutada",
        "fallida",
        "cancelada",
      ],
      estado_acuerdo_t: [
        "borrador",
        "pendiente_aprobacion",
        "vigente",
        "cumplido",
        "incumplido",
        "cancelado",
      ],
      estado_acuse_t: [
        "encolado",
        "entregado",
        "leido",
        "rebotado",
        "fallido",
        "no_entregable",
      ],
      estado_caso_juridico_t: [
        "remitido",
        "documentacion",
        "radicado",
        "admitido",
        "en_tramite",
        "medidas_cautelares",
        "conciliacion",
        "sentencia",
        "ejecucion",
        "terminado",
        "desistido",
        "archivado",
      ],
      estado_certificacion_t: ["vigente", "anulada"],
      estado_costa_t: [
        "liquidada",
        "impugnada",
        "en_firme",
        "recuperada",
        "no_recuperable",
      ],
      estado_cuota_acuerdo_t: [
        "pendiente",
        "parcial",
        "pagada",
        "vencida",
        "incumplida",
        "cancelada",
      ],
      estado_linea_tipo_t: [
        "grupo",
        "detalle",
        "subtotal",
        "total",
        "calculada",
      ],
      estado_promesa_t: ["pendiente", "cumplida", "incumplida", "cancelada"],
      etapa_cobranza_t: [
        "preventiva",
        "administrativa",
        "prejuridica",
        "juridica",
        "judicial",
      ],
      extracto_origen_t: ["banco", "pasarela", "datafono"],
      factura_estado_t: [
        "borrador",
        "registrada",
        "en_revision",
        "en_disputa",
        "aprobada",
        "programada",
        "pagada_parcial",
        "pagada",
        "anulada",
      ],
      finanzas_flujo_escenario_t: ["base", "conservador", "optimista"],
      fondo_base_calculo_t: ["presupuesto_anual", "cuota_administracion"],
      fondo_compromiso_estado_t: [
        "proyectado",
        "comprometido",
        "parcialmente_ejecutado",
        "ejecutado",
        "liberado",
        "anulado",
      ],
      fondo_estado_t: [
        "propuesto",
        "pendiente_autorizacion",
        "activo",
        "suspendido",
        "agotado",
        "en_cierre",
        "cerrado",
        "cancelado",
      ],
      fondo_movimiento_tipo_t: [
        "aporte",
        "uso",
        "rendimiento",
        "traslado_entrada",
        "traslado_salida",
        "ajuste",
        "reversion",
        "cierre_remanente",
      ],
      fondo_naturaleza_t: ["imprevistos", "destinacion_especifica"],
      fondo_solicitud_uso_estado_t: [
        "borrador",
        "en_revision",
        "aprobada",
        "rechazada",
        "comprometida",
        "ejecutada",
        "anulada",
      ],
      fundamento_estado_t: ["activo", "propuesto", "rechazado"],
      fundamento_tipo_t: [
        "ley",
        "decreto",
        "reglamento_ph",
        "decision_asamblea",
        "otra",
        "orientacion_tecnica",
      ],
      garantia_origen_t: [
        "constructora",
        "fabricante",
        "proveedor",
        "contrato",
      ],
      gobierno_compromiso_estado_t: [
        "pendiente",
        "en_progreso",
        "bloqueado",
        "cumplido",
        "cancelado",
      ],
      gobierno_decision_estado_t: [
        "vigente",
        "anulada",
        "revocada",
        "impugnada",
      ],
      gobierno_expediente_calidad_t: ["propietario", "tenedor", "tercero"],
      gobierno_expediente_etapa_t: [
        "reportado",
        "conciliacion_comite",
        "requerimiento_escrito",
        "descargos",
        "decision_organo",
        "sancion_impuesta",
        "archivado",
        "impugnacion",
        "firme",
      ],
      gobierno_tipo_vencimiento_t: [
        "compromiso",
        "expediente_convivencia",
        "impugnacion",
        "solicitud",
        "acta_disposicion",
      ],
      hallazgo_estado_t: ["abierto", "en_tratamiento", "aceptado", "cerrado"],
      impugnacion_estado_t: [
        "presentada",
        "en_tramite",
        "resuelta",
        "desistida",
      ],
      impugnacion_objeto_t: ["decision", "sancion"],
      impugnacion_resultado_t: [
        "confirmada",
        "revocada",
        "modificada",
        "inadmitida",
      ],
      incidencia_estado_t: [
        "reportada",
        "en_evaluacion",
        "convertida",
        "resuelta",
        "descartada",
      ],
      inmueble_estado_t: ["activo", "inactivo"],
      intencion_pago_estado_t: [
        "creada",
        "pendiente",
        "aprobada",
        "rechazada",
        "expirada",
      ],
      interes_day_count_t: [
        "mensual_30_dias_reales",
        "actual_365",
        "actual_360",
        "treinta_360",
      ],
      interes_descuento_orden_t: [
        "interes_sobre_capital_completo",
        "descuento_antes_interes",
      ],
      inventario_alerta_tipo_t: ["stock_bajo", "sin_stock", "punto_reorden"],
      invite_status_t: ["pending", "accepted", "revoked", "expired"],
      liquidacion_estado_t: [
        "pre_liquidada",
        "pendiente_aprobacion",
        "rechazada",
        "aplicada",
        "descartada",
        "anulada",
        "fallida",
      ],
      lote_estado_t: [
        "borrador",
        "programado",
        "aprobado",
        "ejecutado",
        "conciliado",
        "anulado",
      ],
      mant_habilitacion_condicion_t: [
        "categoria_activo",
        "tipo_mantenimiento",
        "trabajo_alturas",
        "parada_servicio",
        "monto_minimo",
      ],
      marco_contable_grupo_t: ["grupo_2", "grupo_3"],
      mayoria_tipo_t: ["ordinaria", "calificada_70", "unanimidad"],
      member_status_t: ["active", "revoked"],
      movimiento_tipo_t: ["entrada", "salida", "ajuste", "transferencia"],
      nivel_riesgo_t: ["ninguno", "bajo", "medio", "alto", "critico"],
      novedad_estado_t: ["pendiente", "aprobada", "rechazada"],
      novedad_tipo_t: [
        "CHARGE",
        "DISCOUNT",
        "ADJUSTMENT",
        "REFUND",
        "CREDIT",
        "DEBIT",
      ],
      origen_accion_cobranza_t: ["job", "manual"],
      origen_acuse_t: ["proveedor", "manual"],
      origen_evento_t: ["job", "usuario", "sistema", "integracion"],
      ot_estado_t: [
        "borrador",
        "programada",
        "asignada",
        "en_ejecucion",
        "ejecutada",
        "pendiente_aprobacion",
        "cerrada",
        "cancelada",
      ],
      ot_origen_t: ["programacion", "incidencia", "inspeccion", "manual"],
      pasarela_modo_t: ["sandbox", "produccion"],
      pasarela_proveedor_t: ["wompi", "payu", "epayco", "bold"],
      periodo_estado_t: ["abierto", "en_liquidacion", "cerrado", "bloqueado"],
      permiso_vehiculo_estado_t: ["vigente", "revocado"],
      plan_alcance_t: ["activo", "tipo_activo", "categoria", "ubicacion"],
      plan_frecuencia_origen_t: ["heredada_requisito", "propia"],
      politica_imputacion_estrategia_t: ["deuda_mas_antigua", "periodo_actual"],
      posicion_naturaleza_t: [
        "activo_liquido",
        "restringido",
        "obligacion",
        "derecho",
      ],
      presupuesto_cuenta_naturaleza_t: ["ingreso", "egreso"],
      presupuesto_estado_t: ["borrador", "aprobado", "vigente", "cerrado"],
      presupuesto_reconocimiento_ingreso_t: ["causacion", "caja"],
      programacion_estado_t: ["pendiente", "generada", "omitida", "cancelada"],
      propuesta_estado_t: ["pendiente", "aprobada", "rechazada"],
      redondeo_modo_t: ["half_up", "half_even", "down", "up"],
      requisito_tipo_t: [
        "legal_nacional",
        "legal_territorial",
        "tecnico_fabricante",
        "contractual",
        "interno",
      ],
      reserva_estado_t: [
        "solicitada",
        "aprobada",
        "rechazada",
        "cancelada",
        "completada",
        "no_show",
      ],
      reserva_solicitante_t: ["externo", "staff"],
      residual_metodo_t: ["mayor_resto"],
      respuesta_valor_t: ["conforme", "no_conforme", "no_aplica"],
      resultado_accion_cobranza_t: [
        "sin_respuesta",
        "contacto_efectivo",
        "contacto_no_efectivo",
        "promesa_de_pago",
        "acuerdo_solicitado",
        "pago_recibido",
        "rechazo_deudor",
        "datos_incorrectos",
        "no_aplica",
      ],
      reunion_convocatoria_t: [
        "primera",
        "segunda",
        "universal_sin_convocatoria",
      ],
      reunion_estado_t: ["convocada", "instalada", "cerrada", "cancelada"],
      reunion_modalidad_t: ["presencial", "no_presencial", "mixta"],
      severidad_t: ["critico", "mayor", "menor", "observacion"],
      solicitud_estado_t: [
        "nueva",
        "asignada",
        "en_atencion",
        "en_espera",
        "resuelta",
        "cerrada",
        "anulada",
        "recibida_externa",
        "rechazada_triage",
        "cancelada_por_solicitante",
      ],
      tarea_estado_t: ["pendiente", "ejecutada", "no_aplica"],
      tenant_role_t: ["auxiliar", "auditor", "administrador"],
      tenant_status_t: ["active", "suspended", "deleted"],
      tercero_tipo_t: ["natural", "juridica"],
      tipo_accion_cobranza_t: [
        "email",
        "sms",
        "whatsapp",
        "llamada",
        "carta",
        "requerimiento_formal",
        "aviso_prejuridico",
        "publicacion_morosos",
        "restriccion_servicios",
        "visita",
        "asignacion_abogado",
        "remision_juridica",
        "propuesta_acuerdo",
        "revision_manual",
      ],
      tipo_costa_t: [
        "gasto_proceso",
        "agencias_en_derecho",
        "honorario_auxiliar",
        "otro_costo_aprobado",
      ],
      tipo_evento_cartera_t: [
        "CARGO_VENCIDO",
        "CARGO_SALDADO",
        "CARTERA_CLASIFICACION_CAMBIO",
        "CARTERA_ETAPA_CAMBIO",
        "CARTERA_POSICION_CONGELADA",
        "COBRANZA_ACCION_PROGRAMADA",
        "COBRANZA_ACCION_APROBADA",
        "COBRANZA_ACCION_RECHAZADA",
        "COBRANZA_ACCION_EJECUTADA",
        "COBRANZA_ACCION_FALLIDA",
        "COBRANZA_ACCION_OMITIDA",
        "COBRANZA_ACCION_CANCELADA",
        "COBRANZA_RESULTADO_REGISTRADO",
        "PROMESA_REGISTRADA",
        "PROMESA_CUMPLIDA",
        "PROMESA_INCUMPLIDA",
        "ACUERDO_CREADO",
        "ACUERDO_APROBADO",
        "ACUERDO_CUOTA_VENCIDA",
        "ACUERDO_CUOTA_PAGADA",
        "ACUERDO_CUMPLIDO",
        "ACUERDO_INCUMPLIDO",
        "CERTIFICACION_DEUDA_EXPEDIDA",
        "CERTIFICACION_DEUDA_ANULADA",
        "CASO_JURIDICO_CREADO",
        "CASO_JURIDICO_ACTUACION",
        "CASO_JURIDICO_ESTADO_CAMBIO",
        "CASO_JURIDICO_CERRADO",
        "COSTA_JUDICIAL_REGISTRADA",
        "PAGO_REGISTRADO",
        "PAGO_IMPUTADO",
        "INTERES_CALCULADO",
        "NOVEDAD_APROBADA",
        "LIQUIDACION_COMPLETADA",
      ],
      tipo_tasa_referencia_t: ["ibc_consumo_ordinario"],
      user_status_t: ["active", "suspended"],
      vehiculo_estado_t: ["activo", "inactivo", "retirado"],
      vigencia_estado_t: ["borrador", "vigente", "historica"],
      votacion_estado_t: ["abierta", "cerrada", "anulada"],
      votacion_metodo_t: ["si_no_abstencion", "opciones", "eleccion"],
      votacion_resultado_t: ["aprobada", "rechazada", "sin_quorum"],
      votacion_sentido_t: ["favor", "contra", "abstencion"],
    },
  },
} as const

