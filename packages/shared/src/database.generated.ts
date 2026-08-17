/**
 * GENERADO — no editar a mano (Fase I §3.3, DB-first).
 * Regenerar con: pnpm db:types
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
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
      cargos: {
        Row: {
          cargo_capital_origen_id: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id: string | null
          created_at: string
          id: string
          inmueble_id: string
          liquidacion_linea_id: string | null
          monto_original: number
          novedad_id: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          tenant_id: string
        }
        Insert: {
          cargo_capital_origen_id?: string | null
          categoria: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          id?: string
          inmueble_id: string
          liquidacion_linea_id?: string | null
          monto_original: number
          novedad_id?: string | null
          origen_tipo: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id: string
          tenant_id: string
        }
        Update: {
          cargo_capital_origen_id?: string | null
          categoria?: Database["public"]["Enums"]["cargo_categoria_t"]
          concepto_id?: string | null
          created_at?: string
          id?: string
          inmueble_id?: string
          liquidacion_linea_id?: string | null
          monto_original?: number
          novedad_id?: string | null
          origen_tipo?: Database["public"]["Enums"]["cargo_origen_t"]
          periodo_id?: string
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
          concepto_id: string
          created_at: string
          created_by: string
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael: string | null
          hash: string
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre: string
          prioridad: number
          tenant_id: string
          tipo_base: Database["public"]["Enums"]["concepto_tipo_base_t"]
          version: number
        }
        Insert: {
          concepto_id: string
          created_at?: string
          created_by: string
          estado_concepto: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael?: string | null
          hash: string
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre: string
          prioridad: number
          tenant_id: string
          tipo_base: Database["public"]["Enums"]["concepto_tipo_base_t"]
          version?: number
        }
        Update: {
          concepto_id?: string
          created_at?: string
          created_by?: string
          estado_concepto?: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael?: string | null
          hash?: string
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre?: string
          prioridad?: number
          tenant_id?: string
          tipo_base?: Database["public"]["Enums"]["concepto_tipo_base_t"]
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
          aprobado_at: string | null
          aprobado_por: string | null
          codigo: string
          created_at: string
          enviado_a_revision_at: string | null
          enviado_a_revision_por: string | null
          estado: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael: string | null
          id: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre: string
          prioridad: number
          rechazado_motivo: string | null
          tenant_id: string
          tipo_base: Database["public"]["Enums"]["concepto_tipo_base_t"]
          updated_at: string | null
          version: number
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          codigo: string
          created_at?: string
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael?: string | null
          id?: string
          modo_calculo: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre: string
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id: string
          tipo_base: Database["public"]["Enums"]["concepto_tipo_base_t"]
          updated_at?: string | null
          version?: number
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          codigo?: string
          created_at?: string
          enviado_a_revision_at?: string | null
          enviado_a_revision_por?: string | null
          estado?: Database["public"]["Enums"]["concepto_estado_t"]
          formula_ael?: string | null
          id?: string
          modo_calculo?: Database["public"]["Enums"]["concepto_modo_calculo_t"]
          nombre?: string
          prioridad?: number
          rechazado_motivo?: string | null
          tenant_id?: string
          tipo_base?: Database["public"]["Enums"]["concepto_tipo_base_t"]
          updated_at?: string | null
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
      cuentas_bancarias: {
        Row: {
          activa: boolean
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
          busqueda_tsv: unknown
          created_at: string
          fecha_vencimiento: string | null
          grupo_id: string
          id: string
          inmueble_id: string | null
          nombre_archivo: string
          storage_path: string
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string
          tipo_documento_id: number
          version: number
        }
        Insert: {
          busqueda_tsv?: unknown
          created_at?: string
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo: string
          storage_path: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id: string
          tipo_documento_id: number
          version?: number
        }
        Update: {
          busqueda_tsv?: unknown
          created_at?: string
          fecha_vencimiento?: string | null
          grupo_id?: string
          id?: string
          inmueble_id?: string | null
          nombre_archivo?: string
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id?: string
          tipo_documento_id?: number
          version?: number
        }
        Relationships: [
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
      estados_cuenta_generados: {
        Row: {
          created_at: string
          datos: Json
          generado_por: string | null
          id: string
          inmueble_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          datos: Json
          generado_por?: string | null
          id?: string
          inmueble_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          datos?: Json
          generado_por?: string | null
          id?: string
          inmueble_id?: string
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
      fondo_movimientos: {
        Row: {
          autorizado_por: string | null
          created_at: string
          descripcion: string | null
          fondo_id: string
          id: string
          liquidacion_id: string | null
          monto: number
          periodo_id: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Insert: {
          autorizado_por?: string | null
          created_at?: string
          descripcion?: string | null
          fondo_id: string
          id?: string
          liquidacion_id?: string | null
          monto: number
          periodo_id?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Update: {
          autorizado_por?: string | null
          created_at?: string
          descripcion?: string | null
          fondo_id?: string
          id?: string
          liquidacion_id?: string | null
          monto?: number
          periodo_id?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fondo_movimiento_tipo_t"]
        }
        Relationships: [
          {
            foreignKeyName: "fondo_movimientos_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "fondo_movimientos_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
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
      fondos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          saldo_actual: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          saldo_actual?: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          saldo_actual?: number
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fondo_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
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
        ]
      }
      fuente_financiacion: {
        Row: {
          created_at: string
          descripcion: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["fuente_financiacion_tipo_t"]
          updated_at: string | null
          valor_aplicado: number
          valor_disponible: number
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["fuente_financiacion_tipo_t"]
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible: number
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fundamento_normativo_id?: number | null
          id?: string
          presupuesto_id?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["fuente_financiacion_tipo_t"]
          updated_at?: string | null
          valor_aplicado?: number
          valor_disponible?: number
        }
        Relationships: [
          {
            foreignKeyName: "fuente_financiacion_fundamento_normativo_id_fkey"
            columns: ["fundamento_normativo_id"]
            isOneToOne: false
            referencedRelation: "fundamento_normativo"
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
        ]
      }
      fundamento_normativo: {
        Row: {
          articulo: string | null
          created_at: string
          descripcion: string | null
          fecha_vigencia: string | null
          id: number
          norma: string
          referencia: string | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at: string | null
        }
        Insert: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vigencia?: string | null
          id?: never
          norma: string
          referencia?: string | null
          tenant_id?: string | null
          tipo: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
        }
        Update: {
          articulo?: string | null
          created_at?: string
          descripcion?: string | null
          fecha_vigencia?: string | null
          id?: never
          norma?: string
          referencia?: string | null
          tenant_id?: string | null
          tipo?: Database["public"]["Enums"]["fundamento_tipo_t"]
          updated_at?: string | null
        }
        Relationships: [
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
      inmuebles: {
        Row: {
          area_comun: number | null
          area_privada: number | null
          busqueda_tsv: unknown
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id: number | null
          estado_legal_observaciones: string | null
          habitabilidad_id: number | null
          id: string
          matricula_inmobiliaria: string | null
          tenant_id: string
          tipo_id: number
          updated_at: string | null
        }
        Insert: {
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string
          matricula_inmobiliaria?: string | null
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
        }
        Update: {
          area_comun?: number | null
          area_privada?: number | null
          busqueda_tsv?: unknown
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["inmueble_estado_t"]
          estado_legal_id?: number | null
          estado_legal_observaciones?: string | null
          habitabilidad_id?: number | null
          id?: string
          matricula_inmobiliaria?: string | null
          tenant_id?: string
          tipo_id?: number
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
          created_at: string
          estado: Database["public"]["Enums"]["liquidacion_estado_t"]
          id: string
          periodo_id: string
          result_hash: string
          tenant_id: string
          tenant_total: number
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          periodo_id: string
          result_hash: string
          tenant_id: string
          tenant_total: number
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["liquidacion_estado_t"]
          id?: string
          periodo_id?: string
          result_hash?: string
          tenant_id?: string
          tenant_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos"
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
      novedades: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inmueble_id: string
          monto: number
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by: string
          descripcion: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id?: string
          inmueble_id: string
          monto: number
          rejected_reason?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          busqueda_tsv?: unknown
          concepto_id?: string | null
          created_at?: string
          created_by?: string
          descripcion?: string
          estado?: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva?: string
          id?: string
          inmueble_id?: string
          monto?: number
          rejected_reason?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["novedad_tipo_t"]
        }
        Relationships: [
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
        ]
      }
      pago_aplicaciones: {
        Row: {
          cargo_id: string
          created_at: string
          id: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          id?: string
          monto: number
          pago_id: string
          tenant_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          id?: string
          monto?: number
          pago_id?: string
          tenant_id?: string
        }
        Relationships: [
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
          created_at: string
          fecha_pago: string
          id: string
          inmueble_id: string
          monto: number
          referencia: string | null
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          fecha_pago: string
          id?: string
          inmueble_id: string
          monto: number
          referencia?: string | null
          registrado_por?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          fecha_pago?: string
          id?: string
          inmueble_id?: string
          monto?: number
          referencia?: string | null
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
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
      periodos: {
        Row: {
          anio: number
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento: string | null
          id: string
          mes: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
          mes: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["periodo_estado_t"]
          fecha_vencimiento?: string | null
          id?: string
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
          interes_multiplicador: number | null
          interes_tasa_mensual: number | null
          interes_tipo_tasa:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual: number | null
          policy_hash: string
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
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash: string
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
          interes_multiplicador?: number | null
          interes_tasa_mensual?: number | null
          interes_tipo_tasa?:
            | Database["public"]["Enums"]["tipo_tasa_referencia_t"]
            | null
          interes_tope_mensual?: number | null
          policy_hash?: string
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
      presupuesto_rubros: {
        Row: {
          categoria_id: number
          codigo: string
          created_at: string
          fundamento_normativo_id: number | null
          id: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria_id: number
          codigo: string
          created_at?: string
          fundamento_normativo_id?: number | null
          id?: string
          monto_anual: number
          nombre: string
          presupuesto_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          categoria_id?: number
          codigo?: string
          created_at?: string
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
            foreignKeyName: "presupuesto_rubros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
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
          phone: string | null
          status: Database["public"]["Enums"]["user_status_t"]
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
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
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
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status_t"]
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
          ciudad: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          direccion: string | null
          email: string | null
          id: string
          logo_path: string | null
          logo_storage_path: string | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tipo_division_id: number
          updated_at: string | null
          zona_horaria: string
        }
        Insert: {
          ciudad?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          logo_storage_path?: string | null
          moneda?: string
          name: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tipo_division_id?: number
          updated_at?: string | null
          zona_horaria?: string
        }
        Update: {
          ciudad?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          logo_storage_path?: string | null
          moneda?: string
          name?: string
          nit?: string | null
          nit_digito_verificacion?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1?: string | null
          telefono_2?: string | null
          tipo_division_id?: number
          updated_at?: string | null
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
            foreignKeyName: "tenants_tipo_division_id_fkey"
            columns: ["tipo_division_id"]
            isOneToOne: false
            referencedRelation: "lista_tipos"
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
          email: string | null
          estado_id: number
          id: string
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
          email?: string | null
          estado_id: number
          id?: string
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
          email?: string | null
          estado_id?: number
          id?: string
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
      zonas_comunes: {
        Row: {
          area: number | null
          codigo: string
          created_at: string
          id: string
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at: string | null
          uso_exclusivo_inmueble_id: string | null
        }
        Insert: {
          area?: number | null
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          tenant_id: string
          tipo_id: number
          updated_at?: string | null
          uso_exclusivo_inmueble_id?: string | null
        }
        Update: {
          area?: number | null
          codigo?: string
          created_at?: string
          id?: string
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
          created_at: string | null
          fecha_vencimiento: string | null
          grupo_id: string | null
          id: string | null
          inmueble_id: string | null
          nombre_archivo: string | null
          storage_path: string | null
          subido_por: string | null
          tamano_bytes: number | null
          tenant_id: string | null
          tipo_documento_id: number | null
          version: number | null
        }
        Insert: {
          busqueda_tsv?: unknown
          created_at?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string | null
          id?: string | null
          inmueble_id?: string | null
          nombre_archivo?: string | null
          storage_path?: string | null
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id?: string | null
          tipo_documento_id?: number | null
          version?: number | null
        }
        Update: {
          busqueda_tsv?: unknown
          created_at?: string | null
          fecha_vencimiento?: string | null
          grupo_id?: string | null
          id?: string | null
          inmueble_id?: string | null
          nombre_archivo?: string | null
          storage_path?: string | null
          subido_por?: string | null
          tamano_bytes?: number | null
          tenant_id?: string | null
          tipo_documento_id?: number | null
          version?: number | null
        }
        Relationships: [
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
      check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window: string }
        Returns: boolean
      }
      create_tenant: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          ciudad: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          direccion: string | null
          email: string | null
          id: string
          logo_path: string | null
          logo_storage_path: string | null
          moneda: string
          name: string
          nit: string | null
          nit_digito_verificacion: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status_t"]
          telefono_1: string | null
          telefono_2: string | null
          tipo_division_id: number
          updated_at: string | null
          zona_horaria: string
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_tenant_id: { Args: never; Returns: string }
      fn_aprobar_novedad: {
        Args: { p_actor_id: string; p_novedad_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inmueble_id: string
          monto: number
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
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
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
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
      fn_rechazar_novedad: {
        Args: { p_motivo: string; p_novedad_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          busqueda_tsv: unknown
          concepto_id: string | null
          created_at: string
          created_by: string
          descripcion: string
          estado: Database["public"]["Enums"]["novedad_estado_t"]
          fecha_efectiva: string
          id: string
          inmueble_id: string
          monto: number
          rejected_reason: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["novedad_tipo_t"]
        }
        SetofOptions: {
          from: "*"
          to: "novedades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_registrar_fuente_financiacion: {
        Args: {
          p_descripcion?: string
          p_fundamento_normativo_id?: number
          p_presupuesto_id: string
          p_tipo: Database["public"]["Enums"]["fuente_financiacion_tipo_t"]
          p_valor_aplicado?: number
          p_valor_disponible: number
        }
        Returns: {
          created_at: string
          descripcion: string | null
          fundamento_normativo_id: number | null
          id: string
          presupuesto_id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["fuente_financiacion_tipo_t"]
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
      fn_tipo_division_default: { Args: never; Returns: number }
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
        }
        SetofOptions: {
          from: "*"
          to: "plantillas_sms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_unaccent_immutable: { Args: { p_texto: string }; Returns: string }
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
      purge_audit_log_antiguo: { Args: never; Returns: undefined }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      shares_tenant_with: { Args: { p_user: string }; Returns: boolean }
      switch_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
    }
    Enums: {
      alcance_accion_cobranza_t: "inmueble" | "cargo"
      canal_cobranza_t:
        | "email"
        | "sms"
        | "whatsapp"
        | "telefono"
        | "fisico"
        | "interno"
      cargo_categoria_t: "capital" | "interes" | "otro"
      cargo_origen_t: "liquidacion_linea" | "novedad" | "interes"
      concepto_estado_t: "borrador" | "en_revision" | "activo" | "archivado"
      concepto_modo_calculo_t: "directo" | "distribucion"
      concepto_tipo_base_t:
        | "fijo"
        | "coeficiente"
        | "cantidad"
        | "porcentaje"
        | "saldo"
      cuenta_bancaria_tipo_t: "ahorros" | "corriente" | "billetera"
      estado_accion_cobranza_t:
        | "programada"
        | "pendiente_aprobacion"
        | "aprobada"
        | "rechazada"
        | "ejecutando"
        | "ejecutada"
        | "fallida"
        | "cancelada"
      etapa_cobranza_t:
        | "preventiva"
        | "administrativa"
        | "prejuridica"
        | "juridica"
        | "judicial"
      fondo_base_calculo_t: "presupuesto_anual" | "cuota_administracion"
      fondo_movimiento_tipo_t: "aporte" | "uso"
      fondo_tipo_t: "imprevistos" | "otro"
      fuente_financiacion_tipo_t:
        | "otros_ingresos"
        | "cuota_extraordinaria"
        | "fondo_imprevistos"
        | "saldo_aplicable"
      fundamento_tipo_t:
        | "ley"
        | "decreto"
        | "reglamento_ph"
        | "decision_asamblea"
        | "otra"
      inmueble_estado_t: "activo" | "inactivo"
      interes_day_count_t:
        | "mensual_30_dias_reales"
        | "actual_365"
        | "actual_360"
        | "treinta_360"
      interes_descuento_orden_t:
        | "interes_sobre_capital_completo"
        | "descuento_antes_interes"
      invite_status_t: "pending" | "accepted" | "revoked" | "expired"
      liquidacion_estado_t: "completada" | "fallida"
      member_status_t: "active" | "revoked"
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
      periodo_estado_t: "abierto" | "en_liquidacion" | "cerrado" | "bloqueado"
      politica_imputacion_estrategia_t: "deuda_mas_antigua" | "periodo_actual"
      presupuesto_estado_t: "borrador" | "aprobado" | "vigente" | "cerrado"
      redondeo_modo_t: "half_up" | "half_even" | "down" | "up"
      residual_metodo_t: "mayor_resto"
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
      tenant_role_t: "agent" | "auditor" | "administrador"
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
      tipo_tasa_referencia_t: "ibc_consumo_ordinario"
      user_status_t: "active" | "suspended"
      vigencia_estado_t: "borrador" | "vigente" | "historica"
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
      alcance_accion_cobranza_t: ["inmueble", "cargo"],
      canal_cobranza_t: [
        "email",
        "sms",
        "whatsapp",
        "telefono",
        "fisico",
        "interno",
      ],
      cargo_categoria_t: ["capital", "interes", "otro"],
      cargo_origen_t: ["liquidacion_linea", "novedad", "interes"],
      concepto_estado_t: ["borrador", "en_revision", "activo", "archivado"],
      concepto_modo_calculo_t: ["directo", "distribucion"],
      concepto_tipo_base_t: [
        "fijo",
        "coeficiente",
        "cantidad",
        "porcentaje",
        "saldo",
      ],
      cuenta_bancaria_tipo_t: ["ahorros", "corriente", "billetera"],
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
      etapa_cobranza_t: [
        "preventiva",
        "administrativa",
        "prejuridica",
        "juridica",
        "judicial",
      ],
      fondo_base_calculo_t: ["presupuesto_anual", "cuota_administracion"],
      fondo_movimiento_tipo_t: ["aporte", "uso"],
      fondo_tipo_t: ["imprevistos", "otro"],
      fuente_financiacion_tipo_t: [
        "otros_ingresos",
        "cuota_extraordinaria",
        "fondo_imprevistos",
        "saldo_aplicable",
      ],
      fundamento_tipo_t: [
        "ley",
        "decreto",
        "reglamento_ph",
        "decision_asamblea",
        "otra",
      ],
      inmueble_estado_t: ["activo", "inactivo"],
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
      invite_status_t: ["pending", "accepted", "revoked", "expired"],
      liquidacion_estado_t: ["completada", "fallida"],
      member_status_t: ["active", "revoked"],
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
      periodo_estado_t: ["abierto", "en_liquidacion", "cerrado", "bloqueado"],
      politica_imputacion_estrategia_t: ["deuda_mas_antigua", "periodo_actual"],
      presupuesto_estado_t: ["borrador", "aprobado", "vigente", "cerrado"],
      redondeo_modo_t: ["half_up", "half_even", "down", "up"],
      residual_metodo_t: ["mayor_resto"],
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
      tenant_role_t: ["agent", "auditor", "administrador"],
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
      tipo_tasa_referencia_t: ["ibc_consumo_ordinario"],
      user_status_t: ["active", "suspended"],
      vigencia_estado_t: ["borrador", "vigente", "historica"],
    },
  },
} as const
