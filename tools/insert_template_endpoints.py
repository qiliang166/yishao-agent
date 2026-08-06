"""Insert template_crud_endpoints.py content into app.py before the dead thumbnail code."""
import os

app_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend', 'app.py')
endpoints_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend', 'template_crud_endpoints.py')

with open(app_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

with open(endpoints_path, 'r', encoding='utf-8') as f:
    endpoints_content = f.read()

# Find insertion point: before "from pptx.dml.color import RGBColor"
marker = '\n    from pptx.dml.color import RGBColor\n'
idx = app_content.index(marker)

# Insert endpoints (with section header)
insertion = '\n\n# ── Template CRUD (auto-generated) ──\n\n' + endpoints_content + '\n'
new_content = app_content[:idx] + insertion + app_content[idx:]

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'Inserted {len(endpoints_content)} bytes of template CRUD endpoints.')
print(f'New app.py size: {len(new_content)} bytes')
