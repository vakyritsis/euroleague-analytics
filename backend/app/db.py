import psycopg
from psycopg.rows import dict_row

from app.config import get_settings


def get_connection():
    database_url = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    return psycopg.connect(database_url, row_factory=dict_row)
