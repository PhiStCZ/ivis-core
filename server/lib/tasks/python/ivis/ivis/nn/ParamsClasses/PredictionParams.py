from .Params import Params


class PredictionParams(Params):
    """Class representing the parameters for `run_prediction` function."""

    def __init__(self, training_params=None, normalization_coefficients=None):
        """
        Parameters
        ----------
        training_params : ivis.nn.TrainingParams
        normalization_coefficients : dict
        """
        self.architecture = None            # the architecture of neural network
        self.index = None                   # the Elasticsearch index
        self.input_signals = []             # The input signals and their types
        self.target_signals = []            # The target signals and their types, keep empty for autoregressive models
        self.ts_field = None                # ES field of ts signal
        self.interval = None                # Aggregation interval in milliseconds.
        self.normalization_coefficients = dict()  #: Normalization coefficients for the signals
        self.input_width = 0                # Number of time steps used for prediction.
        self.target_width = 0               # Number of predicted time steps.

        if training_params is not None:
            self.architecture = training_params.architecture
            self.index = training_params.index
            self.input_signals = training_params.input_signals
            self.target_signals = training_params.target_signals
            self.ts_field = training_params.ts_field
            self.interval = training_params.interval
            self.input_width = training_params.input_width
            self.target_width = training_params.target_width
        if normalization_coefficients is not None:
            self.normalization_coefficients = normalization_coefficients
