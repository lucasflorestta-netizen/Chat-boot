-- Default tags and canned responses for new installations
INSERT INTO public.tags (name, color)
SELECT v.name, v.color
FROM (VALUES
  ('Urgente', '#ef4444'),
  ('VIP', '#8b5cf6'),
  ('Retorno', '#f59e0b')
) AS v(name, color)
WHERE NOT EXISTS (SELECT 1 FROM public.tags t WHERE t.name = v.name);

INSERT INTO public.canned_responses (shortcut, title, body)
SELECT v.shortcut, v.title, v.body
FROM (VALUES
  ('ola', 'Saudação', 'Olá! Como posso ajudá-lo hoje?'),
  ('aguarde', 'Aguarde', 'Por favor, aguarde um momento enquanto verifico isso para você.'),
  ('obrigado', 'Agradecimento', 'Obrigado pelo contato! Fico à disposição caso precise de mais alguma coisa.')
) AS v(shortcut, title, body)
WHERE NOT EXISTS (SELECT 1 FROM public.canned_responses c WHERE c.shortcut = v.shortcut);
