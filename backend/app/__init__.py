# BiasGuard AI Backend Application Package
from app.utils.logging_config import reconfigure_standard_streams

# Initialize safe stream encoding protection on package load
reconfigure_standard_streams()
