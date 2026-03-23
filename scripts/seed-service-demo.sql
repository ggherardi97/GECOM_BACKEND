DO $$
DECLARE
  v_tenant uuid := '1dbd2eb5-51af-4a55-8aa4-de04082fa88c';
  v_user_gustavo uuid;
  v_user_manager uuid;
  v_user_adidas uuid;
  v_company_convert uuid;
  v_company_adidas uuid;
  v_calendar uuid;
  v_policy uuid;
  v_queue_n1 uuid;
  v_queue_field uuid;
  v_queue_fin uuid;
  v_subject_impl uuid;
  v_subject_fin uuid;
  v_subject_field uuid;
  v_task_call uuid;
  v_task_visit uuid;
  v_task_analysis uuid;
  v_resource_gustavo uuid;
  v_resource_manager uuid;
  v_resource_adidas uuid;
  v_asset_convert uuid;
BEGIN
  ALTER TABLE service_resources
    ADD COLUMN IF NOT EXISTS can_receive_cases BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS max_open_incidents INTEGER NULL,
    ADD COLUMN IF NOT EXISTS board_color VARCHAR(30) NULL;

  SELECT id INTO v_user_gustavo
  FROM users
  WHERE tenant_id = v_tenant AND email = 'gherardi97@gmail.com'
  LIMIT 1;

  SELECT id INTO v_user_manager
  FROM users
  WHERE tenant_id = v_tenant AND email = 'adidas@manager.com'
  LIMIT 1;

  SELECT id INTO v_user_adidas
  FROM users
  WHERE tenant_id = v_tenant AND email = 'adidas@user.com'
  LIMIT 1;

  SELECT COALESCE(
    (SELECT id FROM companies WHERE tenant_id = v_tenant AND company_name = 'Convert Solution' LIMIT 1),
    (SELECT id FROM companies WHERE tenant_id = v_tenant ORDER BY created_at ASC LIMIT 1)
  ) INTO v_company_convert;

  SELECT COALESCE(
    (SELECT id FROM companies WHERE tenant_id = v_tenant AND company_name = 'ADIDAS DO BRASIL LTDA' LIMIT 1),
    (SELECT id FROM companies WHERE tenant_id = v_tenant AND id <> v_company_convert ORDER BY created_at ASC LIMIT 1),
    v_company_convert
  ) INTO v_company_adidas;

  INSERT INTO service_calendars (tenant_id, name, timezone, is_default, is_active)
  VALUES (v_tenant, 'Operacao Demo', 'America/Sao_Paulo', FALSE, TRUE)
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET timezone = EXCLUDED.timezone, is_active = TRUE, updated_at = NOW()
  RETURNING id INTO v_calendar;

  INSERT INTO service_calendar_rules (tenant_id, calendar_id, day_of_week, start_time, end_time, is_working_time)
  VALUES
    (v_tenant, v_calendar, 1, TIME '08:00', TIME '18:00', TRUE),
    (v_tenant, v_calendar, 2, TIME '08:00', TIME '18:00', TRUE),
    (v_tenant, v_calendar, 3, TIME '08:00', TIME '18:00', TRUE),
    (v_tenant, v_calendar, 4, TIME '08:00', TIME '18:00', TRUE),
    (v_tenant, v_calendar, 5, TIME '08:00', TIME '18:00', TRUE)
  ON CONFLICT (tenant_id, calendar_id, day_of_week, start_time, end_time)
  DO UPDATE SET is_working_time = EXCLUDED.is_working_time, updated_at = NOW();

  INSERT INTO sla_policies (tenant_id, name, description, is_active, business_calendar_id)
  VALUES (v_tenant, 'SLA Atendimento Demo', 'SLA padrao para massa local de servico.', TRUE, v_calendar)
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET description = EXCLUDED.description, is_active = TRUE, business_calendar_id = EXCLUDED.business_calendar_id, updated_at = NOW()
  RETURNING id INTO v_policy;

  INSERT INTO sla_kpis (
    tenant_id, sla_policy_id, name, kpi_type, start_condition, stop_condition,
    warning_after_minutes, fail_after_minutes, is_active, sort_order
  )
  VALUES
    (v_tenant, v_policy, 'Primeira resposta', 'FIRST_RESPONSE', 'INCIDENT_OPENED', 'FIRST_PUBLIC_REPLY', 30, 60, TRUE, 1),
    (v_tenant, v_policy, 'Resolucao', 'RESOLUTION', 'INCIDENT_OPENED', 'INCIDENT_RESOLVED', 240, 480, TRUE, 2)
  ON CONFLICT (tenant_id, sla_policy_id, sort_order)
  DO UPDATE SET
    name = EXCLUDED.name,
    kpi_type = EXCLUDED.kpi_type,
    start_condition = EXCLUDED.start_condition,
    stop_condition = EXCLUDED.stop_condition,
    warning_after_minutes = EXCLUDED.warning_after_minutes,
    fail_after_minutes = EXCLUDED.fail_after_minutes,
    is_active = TRUE,
    updated_at = NOW();

  INSERT INTO service_queues (tenant_id, name, email, is_active, assignment_mode, default_sla_policy_id)
  VALUES
    (v_tenant, 'Suporte N1', 'suporte@convert-plus.local', TRUE, 'LEAST_BUSY', v_policy),
    (v_tenant, 'Campo', 'campo@convert-plus.local', TRUE, 'ROUND_ROBIN', v_policy),
    (v_tenant, 'Financeiro', 'financeiro@convert-plus.local', TRUE, 'MANUAL', v_policy)
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    email = EXCLUDED.email,
    is_active = TRUE,
    assignment_mode = EXCLUDED.assignment_mode,
    default_sla_policy_id = EXCLUDED.default_sla_policy_id,
    updated_at = NOW();

  SELECT id INTO v_queue_n1 FROM service_queues WHERE tenant_id = v_tenant AND name = 'Suporte N1' LIMIT 1;
  SELECT id INTO v_queue_field FROM service_queues WHERE tenant_id = v_tenant AND name = 'Campo' LIMIT 1;
  SELECT id INTO v_queue_fin FROM service_queues WHERE tenant_id = v_tenant AND name = 'Financeiro' LIMIT 1;

  INSERT INTO service_subjects (tenant_id, name, path, is_active, default_sla_policy_id)
  VALUES
    (v_tenant, 'Implantacao', 'Servicos > Implantacao', TRUE, v_policy),
    (v_tenant, 'Financeiro', 'Servicos > Financeiro', TRUE, v_policy),
    (v_tenant, 'Visita tecnica', 'Servicos > Campo > Visita tecnica', TRUE, v_policy)
  ON CONFLICT (tenant_id, name, parent_id)
  DO UPDATE SET
    path = EXCLUDED.path,
    is_active = TRUE,
    default_sla_policy_id = EXCLUDED.default_sla_policy_id,
    updated_at = NOW();

  SELECT id INTO v_subject_impl FROM service_subjects WHERE tenant_id = v_tenant AND name = 'Implantacao' LIMIT 1;
  SELECT id INTO v_subject_fin FROM service_subjects WHERE tenant_id = v_tenant AND name = 'Financeiro' LIMIT 1;
  SELECT id INTO v_subject_field FROM service_subjects WHERE tenant_id = v_tenant AND name = 'Visita tecnica' LIMIT 1;

  INSERT INTO service_task_types (tenant_id, name, default_duration_minutes, channel, is_active)
  VALUES
    (v_tenant, 'Ligacao', 20, 'CALL', TRUE),
    (v_tenant, 'Analise interna', 45, 'INTERNAL', TRUE),
    (v_tenant, 'Visita tecnica', 90, 'SERVICE', TRUE)
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET
    default_duration_minutes = EXCLUDED.default_duration_minutes,
    channel = EXCLUDED.channel,
    is_active = TRUE,
    updated_at = NOW();

  SELECT id INTO v_task_call FROM service_task_types WHERE tenant_id = v_tenant AND name = 'Ligacao' LIMIT 1;
  SELECT id INTO v_task_analysis FROM service_task_types WHERE tenant_id = v_tenant AND name = 'Analise interna' LIMIT 1;
  SELECT id INTO v_task_visit FROM service_task_types WHERE tenant_id = v_tenant AND name = 'Visita tecnica' LIMIT 1;

  IF v_user_gustavo IS NOT NULL THEN
    INSERT INTO service_resources (tenant_id, user_id, name, calendar_id, skills_json, capacity_per_day, can_receive_cases, max_open_incidents, board_color, is_active)
    VALUES (v_tenant, v_user_gustavo, 'Gustavo - Coordenacao', v_calendar, '["implantacao","financeiro","escalacao"]'::jsonb, 8, TRUE, 8, '#1c84c6', TRUE)
    ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      calendar_id = EXCLUDED.calendar_id,
      skills_json = EXCLUDED.skills_json,
      capacity_per_day = EXCLUDED.capacity_per_day,
      can_receive_cases = TRUE,
      max_open_incidents = 8,
      board_color = '#1c84c6',
      is_active = TRUE,
      updated_at = NOW();
  END IF;

  IF v_user_manager IS NOT NULL THEN
    INSERT INTO service_resources (tenant_id, user_id, name, calendar_id, skills_json, capacity_per_day, can_receive_cases, max_open_incidents, board_color, is_active)
    VALUES (v_tenant, v_user_manager, 'Adidas Manager - Campo', v_calendar, '["campo","visita","prioridade"]'::jsonb, 6, TRUE, 6, '#1ab394', TRUE)
    ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      calendar_id = EXCLUDED.calendar_id,
      skills_json = EXCLUDED.skills_json,
      capacity_per_day = EXCLUDED.capacity_per_day,
      can_receive_cases = TRUE,
      max_open_incidents = 6,
      board_color = '#1ab394',
      is_active = TRUE,
      updated_at = NOW();
  END IF;

  IF v_user_adidas IS NOT NULL THEN
    INSERT INTO service_resources (tenant_id, user_id, name, calendar_id, skills_json, capacity_per_day, can_receive_cases, max_open_incidents, board_color, is_active)
    VALUES (v_tenant, v_user_adidas, 'Adidas User - Backoffice', v_calendar, '["backoffice","financeiro","follow-up"]'::jsonb, 7, TRUE, 5, '#f8ac59', TRUE)
    ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      calendar_id = EXCLUDED.calendar_id,
      skills_json = EXCLUDED.skills_json,
      capacity_per_day = EXCLUDED.capacity_per_day,
      can_receive_cases = TRUE,
      max_open_incidents = 5,
      board_color = '#f8ac59',
      is_active = TRUE,
      updated_at = NOW();
  END IF;

  SELECT id INTO v_resource_gustavo FROM service_resources WHERE tenant_id = v_tenant AND user_id = v_user_gustavo LIMIT 1;
  SELECT id INTO v_resource_manager FROM service_resources WHERE tenant_id = v_tenant AND user_id = v_user_manager LIMIT 1;
  SELECT id INTO v_resource_adidas FROM service_resources WHERE tenant_id = v_tenant AND user_id = v_user_adidas LIMIT 1;

  IF v_queue_n1 IS NOT NULL AND v_user_gustavo IS NOT NULL THEN
    INSERT INTO service_queue_members (tenant_id, queue_id, user_id, role, is_active)
    VALUES (v_tenant, v_queue_n1, v_user_gustavo, 'SUPERVISOR', TRUE)
    ON CONFLICT (tenant_id, queue_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();
  END IF;

  IF v_queue_n1 IS NOT NULL AND v_user_adidas IS NOT NULL THEN
    INSERT INTO service_queue_members (tenant_id, queue_id, user_id, role, is_active)
    VALUES (v_tenant, v_queue_n1, v_user_adidas, 'AGENT', TRUE)
    ON CONFLICT (tenant_id, queue_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();
  END IF;

  IF v_queue_field IS NOT NULL AND v_user_manager IS NOT NULL THEN
    INSERT INTO service_queue_members (tenant_id, queue_id, user_id, role, is_active)
    VALUES (v_tenant, v_queue_field, v_user_manager, 'AGENT', TRUE)
    ON CONFLICT (tenant_id, queue_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();
  END IF;

  IF v_queue_fin IS NOT NULL AND v_user_gustavo IS NOT NULL THEN
    INSERT INTO service_queue_members (tenant_id, queue_id, user_id, role, is_active)
    VALUES (v_tenant, v_queue_fin, v_user_gustavo, 'SUPERVISOR', TRUE)
    ON CONFLICT (tenant_id, queue_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();
  END IF;

  INSERT INTO customer_assets (tenant_id, company_id, name, asset_tag, serial_number, category, status, notes)
  VALUES (v_tenant, v_company_convert, 'Firewall Matriz', 'AT-DEMO-001', 'SER-DEMO-001', 'Infraestrutura', 'ACTIVE', 'Ativo demo para testes locais.')
  ON CONFLICT (tenant_id, asset_tag)
  DO UPDATE SET
    name = EXCLUDED.name,
    serial_number = EXCLUDED.serial_number,
    category = EXCLUDED.category,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING id INTO v_asset_convert;

  DELETE FROM service_tasks
  WHERE tenant_id = v_tenant
    AND incident_id IN (
      SELECT id FROM incidents
      WHERE tenant_id = v_tenant
        AND number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006')
    );

  DELETE FROM service_appointments
  WHERE tenant_id = v_tenant
    AND incident_id IN (
      SELECT id FROM incidents
      WHERE tenant_id = v_tenant
        AND number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006')
    );

  DELETE FROM incidents
  WHERE tenant_id = v_tenant
    AND number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006');

  INSERT INTO incidents (
    tenant_id, number, title, description, status, priority, channel, company_id, asset_id, subject_id,
    queue_id, owner_user_id, opened_by_user_id, due_at, resolved_at, sla_policy_id
  )
  VALUES
    (v_tenant, 'INC-900001', 'Erro no portal financeiro', 'Cliente relata falha ao gerar boleto pelo portal.', 'NEW', 'HIGH', 'PORTAL', v_company_convert, NULL, v_subject_fin, v_queue_fin, v_user_gustavo, v_user_gustavo, NOW() + INTERVAL '6 hour', NULL, v_policy),
    (v_tenant, 'INC-900002', 'Implantacao aguardando retorno', 'Aguardando validacao de acessos por parte do cliente.', 'WAITING_CUSTOMER', 'NORMAL', 'EMAIL', v_company_adidas, NULL, v_subject_impl, v_queue_n1, v_user_adidas, v_user_gustavo, NOW() + INTERVAL '1 day', NULL, v_policy),
    (v_tenant, 'INC-900003', 'Visita tecnica no cliente', 'Necessario avaliar conectividade e troca de equipamento.', 'IN_PROGRESS', 'URGENT', 'PHONE', v_company_convert, v_asset_convert, v_subject_field, v_queue_field, v_user_manager, v_user_gustavo, NOW() + INTERVAL '4 hour', NULL, v_policy),
    (v_tenant, 'INC-900004', 'Ajuste de permissao no sistema', 'Usuario sem acesso ao modulo de contratos.', 'RESOLVED', 'LOW', 'INTERNAL', v_company_adidas, NULL, v_subject_impl, v_queue_n1, v_user_adidas, v_user_gustavo, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hour', v_policy),
    (v_tenant, 'INC-900005', 'Pendencia de cadastro bancario', 'Conta bancaria do fornecedor nao validada.', 'WAITING_INTERNAL', 'NORMAL', 'EMAIL', v_company_convert, NULL, v_subject_fin, v_queue_fin, v_user_gustavo, v_user_gustavo, NOW() + INTERVAL '2 day', NULL, v_policy),
    (v_tenant, 'INC-900006', 'Ticket cancelado para referencia', 'Registro encerrado para testar filtros e status.', 'CANCELLED', 'LOW', 'PORTAL', v_company_adidas, NULL, v_subject_impl, v_queue_n1, v_user_adidas, v_user_gustavo, NOW() - INTERVAL '3 day', NULL, v_policy);

  INSERT INTO sla_instances (
    tenant_id, incident_id, sla_policy_id, status, started_at, completed_at
  )
  SELECT
    i.tenant_id,
    i.id,
    i.sla_policy_id,
    CASE
      WHEN i.status = 'RESOLVED' THEN 'MET'::"SlaInstanceStatus"
      WHEN i.status = 'CANCELLED' THEN 'CANCELLED'::"SlaInstanceStatus"
      ELSE 'RUNNING'::"SlaInstanceStatus"
    END,
    i.created_at,
    CASE
      WHEN i.status = 'RESOLVED' THEN COALESCE(i.resolved_at, i.updated_at, NOW())
      WHEN i.status = 'CANCELLED' THEN COALESCE(i.updated_at, NOW())
      ELSE NULL
    END
  FROM incidents i
  WHERE i.tenant_id = v_tenant
    AND i.number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006')
  ON CONFLICT (incident_id)
  DO UPDATE SET
    sla_policy_id = EXCLUDED.sla_policy_id,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW();

  UPDATE incidents i
  SET sla_instance_id = si.id,
      updated_at = NOW()
  FROM sla_instances si
  WHERE si.incident_id = i.id
    AND i.tenant_id = v_tenant
    AND i.number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006')
    AND (i.sla_instance_id IS DISTINCT FROM si.id);

  INSERT INTO sla_instance_kpis (
    tenant_id, sla_instance_id, sla_kpi_id, status, target_at, warning_at, met_at, breached_at, last_tick_at
  )
  SELECT
    i.tenant_id,
    si.id,
    sk.id,
    CASE
      WHEN i.status = 'RESOLVED' THEN 'MET'::"SlaInstanceKpiStatus"
      WHEN i.status = 'CANCELLED' THEN 'PAUSED'::"SlaInstanceKpiStatus"
      WHEN NOW() > (i.created_at + make_interval(mins => sk.fail_after_minutes)) THEN 'BREACHED'::"SlaInstanceKpiStatus"
      ELSE 'RUNNING'::"SlaInstanceKpiStatus"
    END,
    i.created_at + make_interval(mins => sk.fail_after_minutes),
    i.created_at + make_interval(mins => sk.warning_after_minutes),
    CASE WHEN i.status = 'RESOLVED' THEN COALESCE(i.resolved_at, i.updated_at, NOW()) ELSE NULL END,
    CASE
      WHEN i.status <> 'RESOLVED'
       AND i.status <> 'CANCELLED'
       AND NOW() > (i.created_at + make_interval(mins => sk.fail_after_minutes))
      THEN NOW()
      ELSE NULL
    END,
    NOW()
  FROM incidents i
  JOIN sla_instances si ON si.incident_id = i.id
  JOIN sla_kpis sk ON sk.sla_policy_id = i.sla_policy_id
  WHERE i.tenant_id = v_tenant
    AND i.number IN ('INC-900001', 'INC-900002', 'INC-900003', 'INC-900004', 'INC-900005', 'INC-900006')
  ON CONFLICT (tenant_id, sla_instance_id, sla_kpi_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    target_at = EXCLUDED.target_at,
    warning_at = EXCLUDED.warning_at,
    met_at = EXCLUDED.met_at,
    breached_at = EXCLUDED.breached_at,
    last_tick_at = EXCLUDED.last_tick_at,
    updated_at = NOW();

  INSERT INTO service_tasks (
    tenant_id, incident_id, task_type_id, title, description, type, status, priority,
    assigned_to_user_id, due_at, estimated_minutes, created_by_user_id
  )
  SELECT v_tenant, i.id, v_task_analysis, '[Demo] Revisar causa raiz', 'Validar logs e confirmar origem do problema.', 'INTERNAL'::"TaskTypeChannel", 'OPEN'::"TaskStatus", 'HIGH'::"IncidentPriority", v_user_gustavo, NOW() + INTERVAL '3 hour', 45, v_user_gustavo
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900001'
  UNION ALL
  SELECT v_tenant, i.id, v_task_call, '[Demo] Cobrar retorno do cliente', 'Entrar em contato e confirmar validacao da implantacao.', 'CALL'::"TaskTypeChannel", 'OPEN'::"TaskStatus", 'NORMAL'::"IncidentPriority", v_user_adidas, NOW() + INTERVAL '1 day', 20, v_user_gustavo
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900002'
  UNION ALL
  SELECT v_tenant, i.id, v_task_visit, '[Demo] Executar visita tecnica', 'Levar equipamento reserva e validar conectividade no local.', 'SERVICE'::"TaskTypeChannel", 'IN_PROGRESS'::"TaskStatus", 'URGENT'::"IncidentPriority", v_user_manager, NOW() + INTERVAL '5 hour', 90, v_user_gustavo
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900003'
  UNION ALL
  SELECT v_tenant, i.id, v_task_analysis, '[Demo] Conferir documentacao financeira', 'Revisar dados bancarios antes de liberar o processo.', 'INTERNAL'::"TaskTypeChannel", 'OPEN'::"TaskStatus", 'NORMAL'::"IncidentPriority", v_user_gustavo, NOW() + INTERVAL '2 day', 30, v_user_gustavo
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900005';

  INSERT INTO service_appointments (
    tenant_id, resource_id, incident_id, title, start_at, end_at, status, notes
  )
  SELECT v_tenant, v_resource_manager, i.id, '[Demo] Visita tecnica Convert Solution', CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '10:30', 'SCHEDULED'::"AppointmentStatus", 'Agendamento de campo para avaliacao inicial.'
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900003' AND v_resource_manager IS NOT NULL
  UNION ALL
  SELECT v_tenant, v_resource_gustavo, i.id, '[Demo] Call de alinhamento financeiro', CURRENT_DATE + TIME '11:00', CURRENT_DATE + TIME '11:45', 'SCHEDULED'::"AppointmentStatus", 'Acompanhar pendencias com o financeiro.'
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900001' AND v_resource_gustavo IS NOT NULL
  UNION ALL
  SELECT v_tenant, v_resource_adidas, i.id, '[Demo] Follow-up de implantacao', CURRENT_DATE + TIME '14:00', CURRENT_DATE + TIME '15:00', 'SCHEDULED'::"AppointmentStatus", 'Janela reservada para retorno do cliente.'
  FROM incidents i
  WHERE i.tenant_id = v_tenant AND i.number = 'INC-900002' AND v_resource_adidas IS NOT NULL;
END $$;
