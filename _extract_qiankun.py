
import os

# Read the exact disk offset where project metadata was found
DISK = '/dev/vda3'
offset = 193839139  # Where 'created_by iew_url' data starts
# Actually let's read around the area with project data
# The key offset from the report is ~193839139

with open(DISK, 'rb') as f:
    # Read 200KB around this area
    f.seek(193838000)
    data = f.read(10000)

# Try to decode and find project structure
text = data.decode('utf-8', errors='replace')
print(text[:5000])
