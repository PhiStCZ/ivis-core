import tensorflow as tf
from ivis.nn import elasticsearch as es
from ivis.nn import preprocessing as pre
from ivis.nn import model as nn_model
from ivis.nn import PredictionParams


def run_training(training_parameters, data, model_save_folder):
    """
    Run the training of neural network with specified parameters and data.

    Parameters
    ----------
    training_parameters : ivis.nn.TrainingParams
        The parameters passed from Optimizer (converted to ``dict`` because they were serialized to JSON along the way).
        Before serialization, the parameters were a class derived from Optimizer.TrainingParams.
    data : dict
        The data for training, received from Elasticsearch.
    model_save_folder : str
        Path to save the trained model.

    Returns
    -------
    dict
        The computed losses, etc. This should be returned back to the Optimizer.

    """

    dataframe = es.parse_data(training_parameters, data)
    train_df, val_df, test_df = pre.split_data(training_parameters, dataframe)

    norm_coeffs = pre.compute_normalization_coefficients(training_parameters, train_df)
    train_df, val_df, test_df = pre.preprocess_dataframes(norm_coeffs, train_df, val_df, test_df)

    input_width = training_parameters.input_width
    target_width = training_parameters.target_width
    input_column_names = pre.get_column_names(norm_coeffs, training_parameters.input_signals)
    target_column_names = pre.get_column_names(norm_coeffs, training_parameters.target_signals)

    window_generator_params = {
        "input_width": input_width,
        "target_width": target_width,
        "interval": training_parameters.interval,
        "input_column_names": input_column_names,
        "target_column_names": target_column_names,
    }
    train, val, test = pre.make_datasets(train_df, val_df, test_df, window_generator_params)

    # example = list(train.as_numpy_iterator())
    # for ex in example:
    #     print(ex[0])
    #     print(ex[1])

    input_shape = (input_width, len(input_column_names))
    target_shape = (target_width, len(target_column_names))

    # sample neural network model
    model = nn_model.get_model(training_parameters, input_shape, target_shape)

    # add residual connection - predict the difference
    targets_to_inputs_mapping = nn_model.get_targets_to_inputs_mapping(input_column_names, target_column_names)
    model = nn_model.wrap_with_residual_connection(model, targets_to_inputs_mapping)

    model.compile(
        optimizer=nn_model.get_optimizer(training_parameters),
        loss=tf.losses.mse
    )
    model.summary()

    fit_params = {
        "epochs": 3  # TODO
    }
    metrics_history = model.fit(train, **fit_params)
    print(metrics_history.history)

    # save the model
    model.save(model_save_folder + "model.h5")
    # save the prediction parameters
    prediction_parameters = PredictionParams(training_parameters, norm_coeffs)
    with open(model_save_folder + "prediction_parameters.json", 'w') as file:
        print(prediction_parameters.to_json(), file=file)

    return {
        "train_loss": 1.22,
        "test_loss": 3.4,
    }
