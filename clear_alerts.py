import sqlite3

def resolve_all_alerts():
    try:
        conn = sqlite3.connect('backend/edifica.db')
        cursor = conn.cursor()
        cursor.execute("UPDATE alerts SET resolved = 1 WHERE resolved = 0")
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()
        print(f"✅ Se han resuelto {rows_affected} alertas pendientes en la base de datos.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    resolve_all_alerts()
