import os
import glob
from ultralytics import YOLO

def test_model():
    model_path = "models/best.pt"
    test_dir = "archive/css-data/test/images"
    output_dir = "resultados_test"

    print(f"Cargando modelo desde {model_path}...")
    try:
        model = YOLO(model_path)
    except Exception as e:
        print(f"Error al cargar el modelo: {e}")
        return

    os.makedirs(output_dir, exist_ok=True)

    # Buscar todas las imágenes en el directorio de pruebas (jpg, jpeg, png)
    extensions = ["*.jpg", "*.jpeg", "*.png"]
    images = []
    for ext in extensions:
        images.extend(glob.glob(os.path.join(test_dir, ext)))
    
    if not images:
        print(f"No se encontraron imágenes en {test_dir}")
        return

    print(f"Se encontraron {len(images)} imágenes en el conjunto de prueba.")

    # Para una prueba rápida, tomamos solo las primeras 10 imágenes
    # Puedes cambiar este número o iterar sobre 'images' para procesar todas
    test_subset = images[:10]
    print(f"\nIniciando predicción sobre {len(test_subset)} imágenes de prueba...\n")

    for img_path in test_subset:
        print(f"Procesando: {img_path}")
        
        # Ejecutar predicción
        # save=False porque guardaremos manualmente el frame para controlar la ruta de salida
        results = model(img_path)
        
        for result in results:
            # Obtener el nombre del archivo original
            base_name = os.path.basename(img_path)
            # Guardar el resultado anotado
            save_path = os.path.join(output_dir, base_name)
            result.save(filename=save_path)
            print(f"  -> Guardado: {save_path}")

    print(f"\n¡Prueba finalizada! Revisa las imágenes generadas en la carpeta '{output_dir}'.")

if __name__ == "__main__":
    test_model()
