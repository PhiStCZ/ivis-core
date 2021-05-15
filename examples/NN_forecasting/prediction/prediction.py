import tensorflow as tf
import ivis.nn.prediction as pred
from ivis.nn import preprocessing


def run_prediction(prediction_parameters, model_path, log_callback):
    """
    Predicts future values using the given model and new data.

    Parameters
    ----------
    prediction_parameters : ivis.nn.PredictionParams
        The parameters from user parsed from the JSON parameters of the IVIS Job. It should also contain the signal set,
        signals and their types.
    model_path : str
        Path to load the model from and save the model if it was updated.
    log_callback : callable
        Function to print to Job log.

    Returns
    -------
    bool
        Whether the model was updated and should be uploaded to IVIS server. TODO: this is probably unnecessary as we can simply save the model back to the file from which it was loaded
    any
        New predictions to be inserted into the signal set in Elasticsearch.
    """

    dataframe = pred.load_data(prediction_parameters)
    dataframe = preprocessing.preprocess_using_coefficients(prediction_parameters.normalization_coefficients, dataframe)
    print(dataframe)

    dataset = pred.get_windowed_dataset(prediction_parameters, dataframe)
    for d in dataset.as_numpy_iterator():
        print(d)

    model = tf.keras.models.load_model(model_path)
    model.summary()

    predicted = model.predict(dataset)

    predicted_dataframes = pred.postprocess(prediction_parameters, predicted)

    return True, predicted_dataframes
